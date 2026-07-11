const std = @import("std");
const c = @cImport({
    @cInclude("ghostty.h");
    @cInclude("glib.h");
    @cInclude("gtk/gtk.h");
});

pub const SurfaceCallbacks = struct {
    context: *anyopaque,
    generation: u64,
    queue_render: *const fn (*anyopaque, u64) void,
    close: *const fn (*anyopaque, u64) void,
    child_exit: *const fn (*anyopaque, u64) void,
};

const Entry = struct {
    surface: c.ghostty_surface_t,
    callbacks: SurfaceCallbacks,
};

/// One process-wide Ghostty app and finalized configuration. GTK owns the
/// windows; this object owns only Ghostty's shared runtime resources.
pub const Runtime = struct {
    allocator: std.mem.Allocator,
    config: c.ghostty_config_t,
    app: c.ghostty_app_t,
    entries: std.ArrayList(Entry) = .empty,
    tick_source: c.guint = 0,
    wakeup_pending: bool = false,
    shutting_down: bool = false,

    pub fn init(allocator: std.mem.Allocator) !*Runtime {
        const self = try allocator.create(Runtime);
        errdefer allocator.destroy(self);
        self.* = .{ .allocator = allocator, .config = null, .app = null };

        if (c.ghostty_init(0, null) != c.GHOSTTY_SUCCESS) return error.GhosttyInitFailed;
        self.config = c.ghostty_config_new() orelse return error.ConfigInitFailed;
        errdefer c.ghostty_config_free(self.config);
        c.ghostty_config_load_default_files(self.config);
        c.ghostty_config_load_recursive_files(self.config);
        c.ghostty_config_load_cli_args(self.config);
        c.ghostty_config_finalize(self.config);
        reportDiagnostics(self.config);

        var cfg: c.ghostty_runtime_config_s = std.mem.zeroes(c.ghostty_runtime_config_s);
        cfg.userdata = self;
        cfg.supports_selection_clipboard = true;
        cfg.wakeup_cb = wakeup;
        cfg.action_cb = action;
        cfg.clipboard_has_text_cb = clipboardHasText;
        cfg.read_clipboard_cb = readClipboard;
        cfg.confirm_read_clipboard_cb = confirmReadClipboard;
        cfg.write_clipboard_cb = writeClipboard;
        cfg.close_surface_cb = closeSurface;
        self.app = c.ghostty_app_new(&cfg, self.config) orelse return error.AppInitFailed;
        self.tick_source = c.g_timeout_add(8, tick, self);
        return self;
    }

    pub fn deinit(self: *Runtime) void {
        std.debug.assert(self.entries.items.len == 0);
        self.shutting_down = true;
        if (self.tick_source != 0) _ = c.g_source_remove(self.tick_source);
        c.ghostty_app_free(self.app);
        c.ghostty_config_free(self.config);
        self.entries.deinit(self.allocator);
        const allocator = self.allocator;
        allocator.destroy(self);
    }

    pub fn attach(self: *Runtime, surface: c.ghostty_surface_t, callbacks: SurfaceCallbacks) !void {
        try self.entries.append(self.allocator, .{ .surface = surface, .callbacks = callbacks });
    }

    pub fn detach(self: *Runtime, surface: c.ghostty_surface_t) void {
        for (self.entries.items, 0..) |entry, index| if (entry.surface == surface) {
            _ = self.entries.swapRemove(index);
            return;
        };
    }

    fn callbackFor(self: *Runtime, surface: c.ghostty_surface_t) ?SurfaceCallbacks {
        for (self.entries.items) |entry| if (entry.surface == surface) return entry.callbacks;
        return null;
    }
};

fn reportDiagnostics(config: c.ghostty_config_t) void {
    const count = c.ghostty_config_diagnostics_count(config);
    if (count != 0) std.debug.print("ghostty config diagnostics count={d} (contents suppressed)\n", .{count});
}

fn tick(data: ?*anyopaque) callconv(.c) c.gboolean {
    const self: *Runtime = @ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));
    if (self.shutting_down) return c.G_SOURCE_REMOVE;
    self.wakeup_pending = false;
    c.ghostty_app_tick(self.app);
    return 1;
}

fn wakeup(data: ?*anyopaque) callconv(.c) void {
    const self: *Runtime = @ptrCast(@alignCast(data orelse return));
    if (self.shutting_down or self.wakeup_pending) return;
    self.wakeup_pending = true;
    _ = c.g_idle_add(tick, self);
    c.g_main_context_wakeup(null);
}

fn targetSurface(target: c.ghostty_target_s) ?c.ghostty_surface_t {
    if (target.tag != c.GHOSTTY_TARGET_SURFACE) return null;
    return target.target.surface;
}

fn action(app: c.ghostty_app_t, target: c.ghostty_target_s, value: c.ghostty_action_s) callconv(.c) bool {
    const self: *Runtime = @ptrCast(@alignCast(c.ghostty_app_userdata(app) orelse return false));
    const surface = targetSurface(target) orelse return switch (value.tag) {
        c.GHOSTTY_ACTION_QUIT, c.GHOSTTY_ACTION_CLOSE_ALL_WINDOWS => true,
        else => false,
    };
    const cb = self.callbackFor(surface) orelse return false;
    switch (value.tag) {
        c.GHOSTTY_ACTION_RENDER => cb.queue_render(cb.context, cb.generation),
        c.GHOSTTY_ACTION_CLOSE_TAB, c.GHOSTTY_ACTION_CLOSE_WINDOW, c.GHOSTTY_ACTION_QUIT => cb.close(cb.context, cb.generation),
        c.GHOSTTY_ACTION_SHOW_CHILD_EXITED => cb.child_exit(cb.context, cb.generation),
        // Title, cwd, bell, notification and config actions are accepted here;
        // product observers are added without taking terminal ownership.
        c.GHOSTTY_ACTION_SET_TITLE, c.GHOSTTY_ACTION_PWD, c.GHOSTTY_ACTION_RING_BELL, c.GHOSTTY_ACTION_DESKTOP_NOTIFICATION, c.GHOSTTY_ACTION_RELOAD_CONFIG, c.GHOSTTY_ACTION_CONFIG_CHANGE => {},
        else => return false,
    }
    return true;
}

fn clipboardHasText(_: ?*anyopaque, _: c.ghostty_clipboard_e) callconv(.c) bool {
    return false;
}
fn readClipboard(_: ?*anyopaque, _: c.ghostty_clipboard_e, _: ?*anyopaque) callconv(.c) void {}
fn confirmReadClipboard(_: ?*anyopaque, _: ?[*:0]const u8, _: ?*anyopaque, _: c.ghostty_clipboard_request_e) callconv(.c) void {}
fn writeClipboard(_: ?*anyopaque, _: c.ghostty_clipboard_e, _: [*c]const c.ghostty_clipboard_content_s, _: usize, _: bool) callconv(.c) void {}
fn closeSurface(data: ?*anyopaque, _: bool) callconv(.c) void {
    // Surface userdata is generation-tagged and remains allocated until the
    // GTK destroy path detaches it, making a late close request harmless.
    _ = data;
}

const std = @import("std");
const runtime_mod = @import("ghostty_runtime");
const clipboard = @import("ghostty_clipboard");
const input_mod = @import("ghostty_input");
const process_control = @import("ghostty_process_control");
const guard = @import("guard");
const c = @cImport({
    @cInclude("ghostty.h");
    @cInclude("gtk/gtk.h");
    @cInclude("unistd.h");
});

var live_surfaces: usize = 0;
var live_areas: usize = 0;
var live_gl_contexts: usize = 0;

pub fn liveSurfaceCount() usize { return live_surfaces; }
pub fn liveAreaCount() usize { return live_areas; }
pub fn liveGlContextCount() usize { return live_gl_contexts; }

pub const AccessibilityContract = struct {
    pub const name = "git-stacks Ghostty terminal";
    pub const description = "Focusable embedded terminal surface";
    pub const cell_text = false;
    pub const caret = false;
    pub const selection = false;
    pub const actions = false;
};

pub const AccessibilitySnapshot = struct { role: c.GtkAccessibleRole, focusable: bool };

pub const LaunchSpec = struct {
    surface_id: [36]u8,
    workspace_id: [36]u8,
    repository_id: [36]u8,
    revision: u64,
    cwd: [513]u8 = [_]u8{0} ** 513,
    command: [8193]u8 = [_]u8{0} ** 8193,
    environment_keys: [128][129]u8 = undefined,
    environment_values: [128][513]u8 = undefined,
    environment_count: u8 = 0,
};

pub fn configureAccessibility(area: *c.GtkGLArea) void {
    c.gtk_widget_set_focusable(@ptrCast(area), 1);
    c.gtk_accessible_update_property(@ptrCast(area),
        c.GTK_ACCESSIBLE_PROPERTY_LABEL, AccessibilityContract.name,
        c.GTK_ACCESSIBLE_PROPERTY_DESCRIPTION, AccessibilityContract.description,
        @as(c_int, -1));
}

pub fn inspectAccessibility(area: *c.GtkGLArea) AccessibilitySnapshot {
    return .{
        .role = c.gtk_accessible_get_accessible_role(@ptrCast(area)),
        .focusable = c.gtk_widget_get_focusable(@ptrCast(area)) != 0,
    };
}

pub const Surface = struct {
    runtime: *runtime_mod.Runtime,
    area: *c.GtkGLArea,
    surface: c.ghostty_surface_t = null,
    generation: u64 = 1,
    realized: bool = false,
    destroyed: bool = false,
    draw_count: u64 = 0,
    controller: ?process_control.Controller = null,
    registry: *guard.Registry,
    registration_source: c.guint = 0,
    clipboard_context: *clipboard.Context,
    input: input_mod.Input,
    surface_id: [36]u8,
    launch: ?LaunchSpec = null,

    pub fn create(runtime: *runtime_mod.Runtime, registry: *guard.Registry) !*Surface {
        return createWithLaunch(runtime, registry, null);
    }

    pub fn createWithLaunch(runtime: *runtime_mod.Runtime, registry: *guard.Registry, launch: ?LaunchSpec) !*Surface {
        const self = try runtime.allocator.create(Surface);
        errdefer runtime.allocator.destroy(self);
        const area = c.gtk_gl_area_new() orelse return error.GtkGlAreaFailed;
        _ = c.g_object_ref_sink(area);
        live_areas += 1;
        self.* = undefined;
        self.runtime = runtime;
        self.area = @ptrCast(area);
        self.surface = null;
        self.generation = 1;
        self.realized = false;
        self.destroyed = false;
        self.draw_count = 0;
        self.controller = null;
        self.registry = registry;
        self.registration_source = 0;
        self.launch = launch;
        if (launch) |spec| self.surface_id = spec.surface_id else
            _ = std.fmt.bufPrint(&self.surface_id, "00000000-0000-4000-8000-{d:0>12}", .{runtime.allocateSurfaceNumber()}) catch unreachable;
        self.clipboard_context = try clipboard.Context.create(runtime.allocator, @ptrCast(self.area), self.generation);
        errdefer runtime.allocator.destroy(self.clipboard_context);
        try input_mod.Input.install(self.clipboard_context, &self.input);
        c.g_object_set_data(@ptrCast(self.area), "git-stacks-ime", self.input.ime);
        c.gtk_gl_area_set_required_version(self.area, 3, 3);
        c.gtk_gl_area_set_has_depth_buffer(self.area, 1);
        c.gtk_gl_area_set_has_stencil_buffer(self.area, 1);
        c.gtk_gl_area_set_auto_render(self.area, 0);
        configureAccessibility(self.area);
        _ = c.g_signal_connect_data(self.area, "realize", @ptrCast(&onRealize), self, null, 0);
        _ = c.g_signal_connect_data(self.area, "render", @ptrCast(&onRender), self, null, 0);
        _ = c.g_signal_connect_data(self.area, "resize", @ptrCast(&onResize), self, null, 0);
        _ = c.g_signal_connect_data(self.area, "map", @ptrCast(&onMap), self, null, 0);
        _ = c.g_signal_connect_data(self.area, "unmap", @ptrCast(&onUnmap), self, null, 0);
        _ = c.g_signal_connect_data(self.area, "unrealize", @ptrCast(&onUnrealize), self, null, 0);
        const focus = c.gtk_event_controller_focus_new() orelse return error.FocusControllerFailed;
        _ = c.g_signal_connect_data(focus, "enter", @ptrCast(&onFocusEnter), self, null, 0);
        _ = c.g_signal_connect_data(focus, "leave", @ptrCast(&onFocusLeave), self, null, 0);
        c.gtk_widget_add_controller(@ptrCast(self.area), focus);
        return self;
    }
    pub fn ownershipIdentity(self:*Surface)?process_control.Identity { const controller=self.controller orelse return null;const value=controller.registration orelse return null;return .{.pid=value.pid,.pgid=value.pgid,.linux_birth_token=value.birth_token}; }

    pub fn widget(self: *Surface) *anyopaque {
        return @ptrCast(self.area);
    }
    pub fn size(self: *Surface) c.ghostty_surface_size_s {
        return if (self.surface) |surface| c.ghostty_surface_size(surface) else std.mem.zeroes(c.ghostty_surface_size_s);
    }
    pub fn sendText(self: *Surface, text: []const u8) void {
        if (self.surface) |surface| c.ghostty_surface_text(surface, text.ptr, text.len);
    }
    pub fn isLive(self: *Surface) bool {
        return !self.destroyed and self.surface != null and self.controller != null and self.controller.?.registration != null;
    }

    pub fn destroy(self: *Surface) void {
        if (self.destroyed) return;
        self.destroyed = true;
        self.teardownSurface();
        self.input.deinit();
        const widget_ptr: *c.GtkWidget = @ptrCast(self.area);
        if (c.gtk_widget_get_parent(widget_ptr) != null) c.gtk_widget_unparent(widget_ptr);
        c.g_object_unref(self.area);
        live_areas -= 1;
        const allocator = self.runtime.allocator;
        allocator.destroy(self);
    }

    fn current(self: *Surface) bool {
        c.gtk_gl_area_make_current(self.area);
        return c.gtk_gl_area_get_error(self.area) == null;
    }

    fn createSurface(self: *Surface) void {
        if (self.surface != null or !self.current()) return;
        var cfg = c.ghostty_surface_config_new();
        // The fork's generated header predates its Linux enum declaration;
        // embedded.zig defines Linux as stable platform tag 3 and an empty
        // pointer-sized payload.
        cfg.platform_tag = 3;
        cfg.platform = std.mem.zeroes(c.ghostty_platform_u);
        cfg.userdata = self.clipboard_context;
        cfg.scale_factor = @floatFromInt(c.gtk_widget_get_scale_factor(@ptrCast(self.area)));
        cfg.context = c.GHOSTTY_SURFACE_CONTEXT_WINDOW;
        var environment: [128]c.ghostty_env_var_s = undefined;
        if (self.launch) |*launch| {
            cfg.working_directory = @ptrCast(&launch.cwd);
            cfg.command = @ptrCast(&launch.command);
            for (0..launch.environment_count) |i| environment[i] = .{
                .key = @ptrCast(&launch.environment_keys[i]),
                .value = @ptrCast(&launch.environment_values[i]),
            };
            cfg.env_vars = &environment;
            cfg.env_var_count = launch.environment_count;
        }
        self.surface = c.ghostty_surface_new(self.runtime.app, &cfg);
        const surface = self.surface orelse {
            std.debug.print("native Ghostty surface creation failed\n", .{});
            return;
        };
        live_surfaces += 1;
        self.clipboard_context.surface = surface;
        self.clipboard_context.alive = true;
        self.clipboard_context.generation = self.generation;
        self.controller = .{
            .api = process_control.productionApi(surface),
            .registry = .{ .context = self.registry, .register_fn = register, .unregister_fn = unregister },
            .clock = .{ .context = self, .sleep_fn = sleep },
            .surface_id = self.surface_id,
            .generation = self.generation,
            .client_pgid = @intCast(c.getpgrp()),
            .guard_pgid = -1,
        };
        if (!self.finishRegistration()) self.registration_source = c.g_timeout_add(10, retryRegistration, self);
    }

    fn finishRegistration(self: *Surface) bool {
        const surface = self.surface orelse return true;
        self.controller.?.exposeLive() catch |err| {
            if (err == error.IdentityUnavailable) return false;
            std.debug.print("native Ghostty process registration failed: {s}\n", .{@errorName(err)});
            self.teardownSurface();
            return true;
        };
        self.runtime.attach(surface, .{
            .context = self,
            .generation = self.generation,
            .queue_render = queueRender,
            .close = requestClose,
            .child_exit = childExit,
        }) catch {
            self.teardownSurface();
            return true;
        };
        if (!self.realized) {
            c.ghostty_surface_display_realized(surface);
            self.realized = true;
            live_gl_contexts += 1;
        }
        self.updateSize();
        c.gtk_gl_area_queue_render(self.area);
        return true;
    }

    fn teardownSurface(self: *Surface) void {
        const surface = self.surface orelse return;
        if (self.registration_source != 0) {
            _ = c.g_source_remove(self.registration_source);
            self.registration_source = 0;
        }
        if (self.controller) |*controller| {
            if (controller.registration != null) _ = controller.close() catch {};
            self.controller = null;
        }
        if (self.realized and self.current()) c.ghostty_surface_display_unrealized(surface);
        if (self.realized) live_gl_contexts -= 1;
        self.realized = false;
        self.runtime.detach(surface);
        clipboard.invalidate(self.clipboard_context);
        c.ghostty_surface_free(surface);
        live_surfaces -= 1;
        self.surface = null;
        self.generation +%= 1;
    }

    fn updateSize(self: *Surface) void {
        const surface = self.surface orelse return;
        const width = c.gtk_widget_get_width(@ptrCast(self.area));
        const height = c.gtk_widget_get_height(@ptrCast(self.area));
        if (width <= 0 or height <= 0) return;
        const scale: u32 = @intCast(@max(1, c.gtk_widget_get_scale_factor(@ptrCast(self.area))));
        if (!self.current()) return;
        c.ghostty_surface_set_content_scale(surface, @floatFromInt(scale), @floatFromInt(scale));
        c.ghostty_surface_set_size(surface, @intCast(width * @as(c_int, @intCast(scale))), @intCast(height * @as(c_int, @intCast(scale))));
        self.input.updateImePoint();
    }
};

fn retryRegistration(data: ?*anyopaque) callconv(.c) c.gboolean {
    const self: *Surface = @ptrCast(@alignCast(data orelse return 0));
    if (self.destroyed) return 0;
    if (!self.finishRegistration()) return 1;
    self.registration_source = 0;
    return 0;
}

fn register(context: *anyopaque, value: guard.Registration) anyerror!void {
    try (@as(*guard.Registry, @ptrCast(@alignCast(context)))).register(value);
}
fn unregister(context: *anyopaque, value: guard.Registration) anyerror!void {
    try (@as(*guard.Registry, @ptrCast(@alignCast(context)))).unregister(value);
}
fn sleep(_: *anyopaque, milliseconds: u64) void {
    std.Thread.sleep(milliseconds * std.time.ns_per_ms);
}

fn queueRender(data: *anyopaque, generation: u64) void {
    const self: *Surface = @ptrCast(@alignCast(data));
    if (!self.destroyed and self.generation == generation) c.gtk_gl_area_queue_render(self.area);
}
fn requestClose(data: *anyopaque, generation: u64) void {
    const self: *Surface = @ptrCast(@alignCast(data));
    if (!self.destroyed and self.generation == generation) c.gtk_widget_set_visible(@ptrCast(self.area), 0);
}
fn childExit(data: *anyopaque, generation: u64) void {
    requestClose(data, generation);
}
fn onRealize(_: ?*c.GtkGLArea, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    self.createSurface();
}
fn onRender(_: ?*c.GtkGLArea, _: ?*c.GdkGLContext, data: ?*anyopaque) callconv(.c) c.gboolean {
    const self: *Surface = @ptrCast(@alignCast(data orelse return 1));
    const surface = self.surface orelse return 1;
    if (!self.current()) return 1;
    c.ghostty_surface_draw(surface);
    self.draw_count += 1;
    return 1;
}
fn onResize(_: ?*c.GtkGLArea, _: c_int, _: c_int, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    self.updateSize();
    c.gtk_gl_area_queue_render(self.area);
}
fn onMap(_: ?*c.GtkWidget, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    if (self.surface) |surface| {
        if (!self.realized and self.current()) {
            c.ghostty_surface_display_realized(surface);
            self.realized = true;
            live_gl_contexts += 1;
        }
        self.updateSize();
    }
}
fn onUnmap(_: ?*c.GtkWidget, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    if (self.surface) |surface| c.ghostty_surface_set_focus(surface, false);
}
fn onUnrealize(_: ?*c.GtkGLArea, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    if (self.surface) |surface| if (self.realized) {
        if (self.current()) c.ghostty_surface_display_unrealized(surface);
        self.realized = false;
        live_gl_contexts -= 1;
    };
}
fn onFocusEnter(_: ?*c.GtkEventControllerFocus, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    if (self.surface) |surface| {
        c.ghostty_surface_set_focus(surface, true);
        self.input.focusIn();
    }
}
fn onFocusLeave(_: ?*c.GtkEventControllerFocus, data: ?*anyopaque) callconv(.c) void {
    const self: *Surface = @ptrCast(@alignCast(data orelse return));
    if (self.surface) |surface| {
        c.ghostty_surface_set_focus(surface, false);
        self.input.focusOut();
    }
}

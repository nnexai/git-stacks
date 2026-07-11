const std = @import("std");
const c = @cImport({
    @cInclude("ghostty.h");
    @cInclude("gtk/gtk.h");
});

/// Stable userdata passed to Ghostty. It outlives every asynchronous clipboard
/// completion and is invalidated before the Ghostty surface is freed.
pub const Context = struct {
    allocator: std.mem.Allocator,
    surface: c.ghostty_surface_t = null,
    widget: *anyopaque,
    generation: u64,
    alive: bool = true,
    pending_reads: usize = 0,

    pub fn create(allocator: std.mem.Allocator, widget: *anyopaque, generation: u64) !*Context {
        const self = try allocator.create(Context);
        self.* = .{ .allocator = allocator, .widget = widget, .generation = generation };
        return self;
    }

    fn releaseIfDead(self: *Context) void {
        if (!self.alive and self.pending_reads == 0) self.allocator.destroy(self);
    }
};

const Read = struct {
    context: *Context,
    generation: u64,
    state: ?*anyopaque,
};

fn clipboard(context: *Context, kind: c.ghostty_clipboard_e) ?*c.GdkClipboard {
    return if (kind == c.GHOSTTY_CLIPBOARD_SELECTION)
        c.gtk_widget_get_primary_clipboard(@ptrCast(@alignCast(context.widget)))
    else
        c.gtk_widget_get_clipboard(@ptrCast(@alignCast(context.widget)));
}

pub fn hasText(userdata: ?*anyopaque, raw_kind: c_int) bool {
    const kind: c.ghostty_clipboard_e = @intCast(raw_kind);
    const context: *Context = @ptrCast(@alignCast(userdata orelse return false));
    if (!context.alive) return false;
    const value = clipboard(context, kind) orelse return false;
    return c.gdk_content_formats_contain_mime_type(c.gdk_clipboard_get_formats(value), "text/plain") != 0;
}

pub fn read(userdata: ?*anyopaque, raw_kind: c_int, state: ?*anyopaque) void {
    const kind: c.ghostty_clipboard_e = @intCast(raw_kind);
    const context: *Context = @ptrCast(@alignCast(userdata orelse return));
    if (!context.alive) return;
    const value = clipboard(context, kind) orelse {
        c.ghostty_surface_complete_clipboard_request(context.surface, "", state, true);
        return;
    };
    const request = std.heap.c_allocator.create(Read) catch return;
    request.* = .{ .context = context, .generation = context.generation, .state = state };
    context.pending_reads += 1;
    c.gdk_clipboard_read_text_async(value, null, readComplete, request);
}

fn readComplete(source: ?*c.GObject, result: ?*c.GAsyncResult, data: ?*anyopaque) callconv(.c) void {
    const request: *Read = @ptrCast(@alignCast(data orelse return));
    defer std.heap.c_allocator.destroy(request);
    const context = request.context;
    defer {
        context.pending_reads -= 1;
        context.releaseIfDead();
    }
    if (!context.alive or context.generation != request.generation or context.surface == null) return;
    var err: ?*c.GError = null;
    const text = c.gdk_clipboard_read_text_finish(@ptrCast(source orelse return), result, &err);
    defer if (text) |value| c.g_free(value);
    defer if (err) |value| c.g_error_free(value);
    c.ghostty_surface_complete_clipboard_request(context.surface, text orelse "", request.state, true);
}

pub fn confirmationAllowed(request: c_int) bool {
    return request == c.GHOSTTY_CLIPBOARD_REQUEST_PASTE;
}

pub fn confirm(userdata: ?*anyopaque, text: ?[*:0]const u8, state: ?*anyopaque, request: c_int) void {
    const context: *Context = @ptrCast(@alignCast(userdata orelse return));
    if (!context.alive or context.surface == null) return;
    // Ordinary user paste is confirmed. Terminal-initiated OSC 52 reads and
    // writes require a future product confirmation UI and are denied here.
    c.ghostty_surface_complete_clipboard_request(context.surface, text orelse "", state, confirmationAllowed(request));
}

pub fn write(userdata: ?*anyopaque, raw_kind: c_int, data: ?[*:0]const u8) void {
    const kind: c.ghostty_clipboard_e = @intCast(raw_kind);
    const context: *Context = @ptrCast(@alignCast(userdata orelse return));
    if (!context.alive or data == null) return;
    const value = clipboard(context, kind) orelse return;
    c.gdk_clipboard_set_text(value, data.?);
}

pub fn invalidate(context: *Context) void {
    context.alive = false;
    context.surface = null;
    context.generation +%= 1;
    context.releaseIfDead();
}

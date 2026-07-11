const std = @import("std");
const vt = @import("vt_adapter");
const renderer_mod = @import("renderer");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

pub const TerminalWidget = struct {
    terminal: *vt.VtAdapter,
    widget: *anyopaque,
    renderer: renderer_mod.Renderer = .{},
    generation: u64 = 1,
    live: bool = true,

    pub fn init(terminal: *vt.VtAdapter) !TerminalWidget {
        const widget = c.gtk_drawing_area_new() orelse return error.WidgetCreationFailed;
        c.gtk_widget_set_focusable(widget, 1);
        c.gtk_widget_set_can_focus(widget, 1);
        c.gtk_accessible_update_property(@ptrCast(widget), c.GTK_ACCESSIBLE_PROPERTY_LABEL, "git-stacks terminal", c.GTK_ACCESSIBLE_PROPERTY_DESCRIPTION, "Focusable terminal output", @as(c_int, -1));
        c.gtk_widget_set_size_request(widget, 720, 432);
        return .{ .terminal = terminal, .widget = @ptrCast(widget) };
    }

    pub fn callbackToken(self: TerminalWidget) u64 { return self.generation; }
    pub fn queueRedraw(self: *TerminalWidget, token: u64) bool {
        if (!self.live or token != self.generation) return false;
        c.gtk_widget_queue_draw(@ptrCast(@alignCast(self.widget)));
        return true;
    }
    pub fn resize(self: *TerminalWidget, width: i32, height: i32) !void {
        const cols: u16 = @intCast(@max(1, @divTrunc(width, 9)));
        const rows: u16 = @intCast(@max(1, @divTrunc(height, 18)));
        try self.terminal.resize(cols, rows);
    }
    pub fn snapshot(self: *TerminalWidget) !*c.GtkSnapshot {
        var frame = try self.terminal.snapshot();
        defer frame.deinit();
        const result = c.gtk_snapshot_new() orelse return error.SnapshotCreationFailed;
        self.renderer.render(@ptrCast(result), frame, c.gtk_widget_has_focus(@ptrCast(@alignCast(self.widget))) != 0);
        return result;
    }
    pub fn unrealize(self: *TerminalWidget) void {
        if (!self.live) return;
        self.live = false;
        self.generation +%= 1;
        c.gtk_widget_unparent(@ptrCast(@alignCast(self.widget)));
    }
};

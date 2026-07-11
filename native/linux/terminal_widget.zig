const std = @import("std");
const vt = @import("vt_adapter");
const renderer_mod = @import("renderer");
const c = @cImport({ @cInclude("gtk/gtk.h"); @cInclude("pango/pangocairo.h"); });
const DrawContext = struct { terminal: *vt.VtAdapter, draws: usize = 0, painted_cells: usize = 0 };
fn draw(widget: ?*c.GtkDrawingArea, cr: ?*c.cairo_t, width: c_int, height: c_int, data: ?*anyopaque) callconv(.c) void {
    _ = widget; const ctx: *DrawContext = @ptrCast(@alignCast(data.?)); const cairo = cr orelse return;
    c.cairo_set_source_rgb(cairo, 0.035, 0.043, 0.055); c.cairo_rectangle(cairo, 0, 0, @floatFromInt(width), @floatFromInt(height)); c.cairo_fill(cairo);
    var frame = ctx.terminal.snapshot() catch return; defer frame.deinit(); ctx.draws += 1; ctx.painted_cells = 0;
    const layout = c.pango_cairo_create_layout(cairo) orelse return; defer c.g_object_unref(layout);
    const desc = c.pango_font_description_from_string("Monospace 12"); defer c.pango_font_description_free(desc); c.pango_layout_set_font_description(layout, desc);
    var bytes: [4]u8 = undefined; for (frame.cells) |cell| { const n = std.unicode.utf8Encode(cell.codepoint, &bytes) catch continue; c.pango_layout_set_text(layout, &bytes, @intCast(n)); c.cairo_move_to(cairo, @as(f64, @floatFromInt(cell.column)) * 9, @as(f64, @floatFromInt(cell.row)) * 18); c.cairo_set_source_rgb(cairo, 0.82, 0.86, 0.92); c.pango_cairo_show_layout(cairo, layout); ctx.painted_cells += 1; }
}

pub const TerminalWidget = struct {
    terminal: *vt.VtAdapter,
    widget: *anyopaque,
    renderer: renderer_mod.Renderer = .{},
    generation: u64 = 1,
    live: bool = true,
    draw_context: *DrawContext,

    pub fn init(terminal: *vt.VtAdapter) !TerminalWidget {
        const widget = c.gtk_drawing_area_new() orelse return error.WidgetCreationFailed;
        c.gtk_widget_set_focusable(widget, 1);
        c.gtk_widget_set_can_focus(widget, 1);
        c.gtk_accessible_update_property(@ptrCast(widget), c.GTK_ACCESSIBLE_PROPERTY_LABEL, "git-stacks terminal", c.GTK_ACCESSIBLE_PROPERTY_DESCRIPTION, "Focusable terminal output", @as(c_int, -1));
        c.gtk_widget_set_size_request(widget, 720, 432);
        const draw_context = try terminal.allocator.create(DrawContext); draw_context.* = .{ .terminal = terminal };
        c.gtk_drawing_area_set_draw_func(@ptrCast(widget), draw, draw_context, null);
        return .{ .terminal = terminal, .widget = @ptrCast(widget), .draw_context = draw_context };
    }

    pub fn callbackToken(self: TerminalWidget) u64 { return self.generation; }
    pub fn drawCount(self: TerminalWidget) usize { return self.draw_context.draws; }
    pub fn paintedCellCount(self: TerminalWidget) usize { return self.draw_context.painted_cells; }
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
        c.gtk_drawing_area_set_draw_func(@ptrCast(@alignCast(self.widget)), null, null, null);
        c.gtk_widget_unparent(@ptrCast(@alignCast(self.widget)));
        self.terminal.allocator.destroy(self.draw_context);
    }
};
pub const AccessibilityContract = struct { pub const role = "terminal"; pub const name = "git-stacks terminal"; pub const description = "Focusable terminal output"; pub const focusable = true; pub const cell_text_provider = false; };

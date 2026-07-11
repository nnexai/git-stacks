const std = @import("std");
const vt = @import("vt_adapter");
const renderer_mod = @import("renderer");
const c = @cImport({ @cInclude("gtk/gtk.h"); @cInclude("pango/pangocairo.h"); });
const DrawContext = struct { terminal: *vt.VtAdapter, font_family: [:0]const u8 = "Monospace", font_size: f32 = 12, cell_width: f64 = 9, cell_height: f64 = 18, draws: usize = 0, painted_cells: usize = 0, cursor_draws: usize = 0, selection_start: ?vt.GridPoint = null, selection_end: ?vt.GridPoint = null };
pub const cursor_color: u32 = 0x59c2ff;
fn selected(ctx: *const DrawContext, cell: vt.Cell) bool {
    const a = ctx.selection_start orelse return false; const b = ctx.selection_end orelse return false;
    const first, const last = if (a.row < b.row or (a.row == b.row and a.column <= b.column)) .{ a, b } else .{ b, a };
    return (cell.row > first.row or (cell.row == first.row and cell.column >= first.column)) and (cell.row < last.row or (cell.row == last.row and cell.column <= last.column));
}
fn draw(widget: ?*c.GtkDrawingArea, cr: ?*c.cairo_t, width: c_int, height: c_int, data: ?*anyopaque) callconv(.c) void {
    _ = widget; const ctx: *DrawContext = @ptrCast(@alignCast(data.?)); const cairo = cr orelse return;
    c.cairo_set_source_rgb(cairo, 0.035, 0.043, 0.055); c.cairo_rectangle(cairo, 0, 0, @floatFromInt(width), @floatFromInt(height)); c.cairo_fill(cairo);
    var frame = ctx.terminal.snapshot() catch return; defer frame.deinit(); ctx.draws += 1; ctx.painted_cells = 0;
    const layout = c.pango_cairo_create_layout(cairo) orelse return; defer c.g_object_unref(layout);
    const desc = c.pango_font_description_new(); defer c.pango_font_description_free(desc); c.pango_font_description_set_family(desc, ctx.font_family.ptr); c.pango_font_description_set_size(desc, @intFromFloat(ctx.font_size * c.PANGO_SCALE)); c.pango_layout_set_font_description(layout, desc);
    var bytes: [4]u8 = undefined; for (frame.cells) |cell| {
        const is_selected = selected(ctx, cell); const style = cell.style;
        const bg = if (is_selected) @as(u32, 0x315b7d) else if (style.inverse) style.foreground else style.background;
        c.cairo_set_source_rgb(cairo, @as(f64, @floatFromInt((bg >> 16) & 255)) / 255, @as(f64, @floatFromInt((bg >> 8) & 255)) / 255, @as(f64, @floatFromInt(bg & 255)) / 255);
        c.cairo_rectangle(cairo, @as(f64, @floatFromInt(cell.column)) * ctx.cell_width, @as(f64, @floatFromInt(cell.row)) * ctx.cell_height, @as(f64, @floatFromInt(cell.width)) * ctx.cell_width, ctx.cell_height); c.cairo_fill(cairo);
        const n = std.unicode.utf8Encode(cell.codepoint, &bytes) catch continue; c.pango_layout_set_text(layout, &bytes, @intCast(n));
        const fg = if (is_selected) @as(u32, 0xffffff) else if (style.inverse) style.background else style.foreground;
        c.cairo_move_to(cairo, @as(f64, @floatFromInt(cell.column)) * ctx.cell_width, @as(f64, @floatFromInt(cell.row)) * ctx.cell_height); c.cairo_set_source_rgba(cairo, @as(f64, @floatFromInt((fg >> 16) & 255)) / 255, @as(f64, @floatFromInt((fg >> 8) & 255)) / 255, @as(f64, @floatFromInt(fg & 255)) / 255, if (style.faint) 0.62 else 1.0); c.pango_cairo_show_layout(cairo, layout);
        if (style.underline) { c.cairo_set_line_width(cairo, 1); c.cairo_move_to(cairo, @as(f64, @floatFromInt(cell.column)) * ctx.cell_width, @as(f64, @floatFromInt(cell.row + 1)) * ctx.cell_height - 2); c.cairo_line_to(cairo, @as(f64, @floatFromInt(cell.column + cell.width)) * ctx.cell_width, @as(f64, @floatFromInt(cell.row + 1)) * ctx.cell_height - 2); c.cairo_stroke(cairo); }
        ctx.painted_cells += 1;
    }
    ctx.cursor_draws = 0;
    if (frame.cursor_visible and frame.cursor_column < frame.columns and frame.cursor_row < frame.rows) {
        const cursor_x = @as(f64, @floatFromInt(frame.cursor_column)) * ctx.cell_width; const cursor_y = @as(f64, @floatFromInt(frame.cursor_row)) * ctx.cell_height;
        c.cairo_set_source_rgb(cairo, @as(f64, @floatFromInt((cursor_color >> 16) & 255)) / 255, @as(f64, @floatFromInt((cursor_color >> 8) & 255)) / 255, @as(f64, @floatFromInt(cursor_color & 255)) / 255);
        c.cairo_rectangle(cairo, cursor_x, cursor_y + ctx.cell_height - 3, ctx.cell_width, 3); c.cairo_fill(cairo); ctx.cursor_draws = 1;
    }
}

pub const TerminalWidget = struct {
    terminal: *vt.VtAdapter,
    widget: *anyopaque,
    renderer: renderer_mod.Renderer = .{},
    generation: u64 = 1,
    live: bool = true,
    draw_context: *DrawContext,

    pub fn init(terminal: *vt.VtAdapter) !TerminalWidget {
        return initAppearance(terminal, "Monospace", 12);
    }
    pub fn initAppearance(terminal: *vt.VtAdapter, family: [:0]const u8, size: f32) !TerminalWidget {
        const widget = c.gtk_drawing_area_new() orelse return error.WidgetCreationFailed;
        c.gtk_widget_set_focusable(widget, 1);
        c.gtk_widget_set_can_focus(widget, 1);
        c.gtk_accessible_update_property(@ptrCast(widget), c.GTK_ACCESSIBLE_PROPERTY_LABEL, "git-stacks terminal", c.GTK_ACCESSIBLE_PROPERTY_DESCRIPTION, "Focusable terminal output", @as(c_int, -1));
        c.gtk_widget_set_size_request(widget, 720, 432);
        const context = c.gtk_widget_get_pango_context(widget) orelse return error.FontMetricsUnavailable;
        const desc = c.pango_font_description_new() orelse return error.FontMetricsUnavailable; defer c.pango_font_description_free(desc);
        c.pango_font_description_set_family(desc, family.ptr); c.pango_font_description_set_size(desc, @intFromFloat(size * c.PANGO_SCALE));
        const metrics = c.pango_context_get_metrics(context, desc, null) orelse return error.FontMetricsUnavailable; defer c.pango_font_metrics_unref(metrics);
        const cell_width = @max(1, @as(f64, @floatFromInt(c.pango_font_metrics_get_approximate_digit_width(metrics))) / c.PANGO_SCALE);
        const cell_height = @max(1, @as(f64, @floatFromInt(c.pango_font_metrics_get_ascent(metrics) + c.pango_font_metrics_get_descent(metrics))) / c.PANGO_SCALE);
        const draw_context = try terminal.allocator.create(DrawContext); draw_context.* = .{ .terminal = terminal, .font_family = family, .font_size = size, .cell_width = cell_width, .cell_height = cell_height };
        c.gtk_drawing_area_set_draw_func(@ptrCast(widget), draw, draw_context, null);
        var result = TerminalWidget{ .terminal = terminal, .widget = @ptrCast(widget), .draw_context = draw_context };
        result.renderer.configure(family, size, .{ .cell_width = @floatCast(cell_width), .cell_height = @floatCast(cell_height) });
        return result;
    }

    pub fn callbackToken(self: TerminalWidget) u64 { return self.generation; }
    pub fn drawCount(self: TerminalWidget) usize { return self.draw_context.draws; }
    pub fn paintedCellCount(self: TerminalWidget) usize { return self.draw_context.painted_cells; }
    pub fn cursorDrawCount(self: TerminalWidget) usize { return self.draw_context.cursor_draws; }
    pub fn fontFamily(self: TerminalWidget) []const u8 { return self.draw_context.font_family; }
    pub fn fontSize(self: TerminalWidget) f32 { return self.draw_context.font_size; }
    pub fn pointFromPixels(self: TerminalWidget, x: f64, y: f64) vt.GridPoint { return .{ .column = @intCast(@min(65535, @as(u64, @intFromFloat(@max(0, x) / self.draw_context.cell_width)))), .row = @intCast(@min(65535, @as(u64, @intFromFloat(@max(0, y) / self.draw_context.cell_height)))) }; }
    pub fn selectionBegin(self: *TerminalWidget, point: vt.GridPoint) void { if (!self.live) return; self.draw_context.selection_start = point; self.draw_context.selection_end = point; _ = self.queueRedraw(self.generation); }
    pub fn selectionUpdate(self: *TerminalWidget, point: vt.GridPoint) void { if (!self.live or self.draw_context.selection_start == null) return; self.draw_context.selection_end = point; _ = self.queueRedraw(self.generation); }
    pub fn selectionText(self: *TerminalWidget, allocator: std.mem.Allocator) !?[]u8 { return try self.terminal.extractText(allocator, self.draw_context.selection_start orelse return null, self.draw_context.selection_end orelse return null); }
    pub fn queueRedraw(self: *TerminalWidget, token: u64) bool {
        if (!self.live or token != self.generation) return false;
        c.gtk_widget_queue_draw(@ptrCast(@alignCast(self.widget)));
        return true;
    }
    pub fn resize(self: *TerminalWidget, width: i32, height: i32) !void {
        const cols: u16 = @intCast(@max(1, @as(i32, @intFromFloat(@as(f64, @floatFromInt(width)) / self.draw_context.cell_width))));
        const rows: u16 = @intCast(@max(1, @as(i32, @intFromFloat(@as(f64, @floatFromInt(height)) / self.draw_context.cell_height))));
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

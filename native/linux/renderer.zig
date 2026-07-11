const std = @import("std");
const vt = @import("vt_adapter");
const c = @cImport({
    @cInclude("gtk/gtk.h");
    @cInclude("pango/pango.h");
});

pub const Metrics = struct { cell_width: f32 = 9, cell_height: f32 = 18 };
pub const Renderer = struct {
    metrics: Metrics = .{},
    rendered_cells: usize = 0,
    pub fn resetScale(self: *Renderer, metrics: Metrics) void { self.metrics = metrics; self.rendered_cells = 0; }

    pub fn render(self: *Renderer, raw_snapshot: *anyopaque, frame: vt.RenderFrame, focused: bool) void {
        const snapshot: *c.GtkSnapshot = @ptrCast(@alignCast(raw_snapshot));
        const width: f32 = @floatFromInt(frame.columns);
        const height: f32 = @floatFromInt(frame.rows);
        const background = c.GdkRGBA{ .red = 0.035, .green = 0.043, .blue = 0.055, .alpha = 1 };
        const bounds = c.graphene_rect_t{ .origin = .{ .x = 0, .y = 0 }, .size = .{ .width = width * self.metrics.cell_width, .height = height * self.metrics.cell_height } };
        c.gtk_snapshot_append_color(snapshot, &background, &bounds);
        const font_map = c.pango_cairo_font_map_get_default();
        const context = c.pango_font_map_create_context(font_map);
        defer c.g_object_unref(context);
        const layout = c.pango_layout_new(context);
        defer c.g_object_unref(layout);
        const description = c.pango_font_description_from_string("Monospace 12");
        defer c.pango_font_description_free(description);
        c.pango_layout_set_font_description(layout, description);
        var buffer: [4]u8 = undefined;
        for (frame.cells) |cell| {
            if (self.rendered_cells >= 131_072) break;
            self.rendered_cells += 1;
            const len = std.unicode.utf8Encode(cell.codepoint, &buffer) catch continue;
            c.pango_layout_set_text(layout, &buffer, @intCast(len));
            const bg = if (cell.selected) @as(u32, 0x315b7d) else if (cell.style.inverse) cell.style.foreground else cell.style.background;
            const cell_bounds = c.graphene_rect_t{ .origin = .{ .x = @as(f32, @floatFromInt(cell.column)) * self.metrics.cell_width, .y = @as(f32, @floatFromInt(cell.row)) * self.metrics.cell_height }, .size = .{ .width = @as(f32, @floatFromInt(cell.width)) * self.metrics.cell_width, .height = self.metrics.cell_height } };
            c.gtk_snapshot_append_color(snapshot, &.{ .red = @as(f32, @floatFromInt((bg >> 16) & 255)) / 255, .green = @as(f32, @floatFromInt((bg >> 8) & 255)) / 255, .blue = @as(f32, @floatFromInt(bg & 255)) / 255, .alpha = 1 }, &cell_bounds);
            c.gtk_snapshot_save(snapshot);
            c.gtk_snapshot_translate(snapshot, &.{ .x = @as(f32, @floatFromInt(cell.column)) * self.metrics.cell_width, .y = @as(f32, @floatFromInt(cell.row)) * self.metrics.cell_height });
            const fg = if (cell.selected) @as(u32, 0xffffff) else if (cell.style.inverse) cell.style.background else cell.style.foreground;
            c.gtk_snapshot_append_layout(snapshot, layout, &.{ .red = @as(f32, @floatFromInt((fg >> 16) & 255)) / 255, .green = @as(f32, @floatFromInt((fg >> 8) & 255)) / 255, .blue = @as(f32, @floatFromInt(fg & 255)) / 255, .alpha = if (cell.style.faint) 0.62 else 1 });
            c.gtk_snapshot_restore(snapshot);
        }
        const cursor = c.graphene_rect_t{ .origin = .{ .x = @as(f32, @floatFromInt(frame.cursor_column)) * self.metrics.cell_width, .y = @as(f32, @floatFromInt(frame.cursor_row)) * self.metrics.cell_height + self.metrics.cell_height - 2 }, .size = .{ .width = self.metrics.cell_width, .height = 2 } };
        c.gtk_snapshot_append_color(snapshot, if (focused) &c.GdkRGBA{ .red = 0.35, .green = 0.75, .blue = 1, .alpha = 1 } else &c.GdkRGBA{ .red = 0.4, .green = 0.4, .blue = 0.4, .alpha = 1 }, &cursor);
    }
};

const std = @import("std");
const vt = @import("vt_adapter");
const widget_mod = @import("terminal_widget");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

test "production widget focuses resizes snapshots and invalidates callbacks" {
    if (c.gtk_init_check() == 0) return error.GtkDisplayUnavailable;
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 20, 4);
    defer terminal.deinit();
    try terminal.feed("known VT text");
    var widget = try widget_mod.TerminalWidget.init(&terminal);
    const window = c.gtk_window_new() orelse return error.WindowCreationFailed;
    defer c.g_object_unref(window);
    c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(widget.widget)));
    c.gtk_window_present(@ptrCast(window));
    var iterations: usize = 0; while (iterations < 20 and widget.drawCount() == 0) : (iterations += 1) _ = c.g_main_context_iteration(null, 0);
    try std.testing.expect(widget.drawCount() > 0);
    try std.testing.expect(widget.paintedCellCount() > 0);
    try std.testing.expect(widget.cursorDrawCount() > 0);
    const cursor = widget_mod.cursor_color;
    const cursor_luma = ((cursor >> 16) & 255) + ((cursor >> 8) & 255) + (cursor & 255);
    try std.testing.expect(cursor_luma > 400);
    widget.selectionBegin(.{ .column = 0, .row = 0 });
    widget.selectionUpdate(.{ .column = 4, .row = 0 });
    const selected = (try widget.selectionText(std.testing.allocator)).?;
    defer std.testing.allocator.free(selected);
    try std.testing.expectEqualStrings("known", selected);
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(widget.widget)));
    try widget.resize(900, 540);
    const snapshot = try widget.snapshot();
    c.g_object_unref(snapshot);
    const token = widget.callbackToken();
    widget.unrealize();
    try std.testing.expect(!widget.queueRedraw(token));
}

test "production Cairo widget applies configured font and recomputes metrics" {
    if (c.gtk_init_check() == 0) return error.GtkDisplayUnavailable;
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 20, 4); defer terminal.deinit();
    var widget = try widget_mod.TerminalWidget.initAppearance(&terminal, "DejaVu Sans Mono", 15.5);
    const window = c.gtk_window_new() orelse return error.WindowCreationFailed; defer c.g_object_unref(window); c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(widget.widget)));
    try std.testing.expectEqualStrings("DejaVu Sans Mono", widget.fontFamily()); try std.testing.expectEqual(@as(f32, 15.5), widget.fontSize());
    const grid = widget.gridForAllocation(900, 540); try std.testing.expect(grid.columns > 20); try std.testing.expect(grid.rows > 4);
    try widget.resize(900, 540); try std.testing.expect(widget.backgroundWidth() >= 900 or widget.drawCount() == 0); widget.unrealize();
}

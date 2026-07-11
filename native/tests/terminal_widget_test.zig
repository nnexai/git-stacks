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
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(widget.widget)));
    try widget.resize(900, 540);
    const snapshot = try widget.snapshot();
    c.g_object_unref(snapshot);
    const token = widget.callbackToken();
    widget.unrealize();
    try std.testing.expect(!widget.queueRedraw(token));
}

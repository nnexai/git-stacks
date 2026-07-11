const std = @import("std");
const vt = @import("vt_adapter");
const renderer = @import("renderer");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

test "renderer snapshots a detached deterministic VT frame" {
    if (c.gtk_init_check() == 0) return error.GtkDisplayUnavailable;
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 20, 4);
    defer terminal.deinit();
    try terminal.feed("git-stacks ready");
    var frame = try terminal.snapshot();
    defer frame.deinit();
    const snapshot = c.gtk_snapshot_new() orelse return error.SnapshotCreationFailed;
    var subject = renderer.Renderer{}; subject.render(@ptrCast(snapshot), frame, true);
    const node = c.gtk_snapshot_free_to_node(snapshot);
    try std.testing.expect(node != null);
    if (node) |value| c.gsk_render_node_unref(value);
}

test "renderer bounds unusually large frames and resets scale cache" {
    var subject = renderer.Renderer{}; subject.rendered_cells = 42; subject.resetScale(.{ .cell_width = 10, .cell_height = 20 });
    try std.testing.expectEqual(@as(usize, 0), subject.rendered_cells);
}

test "snapshot renderer receives the resolved font family size and metrics" {
    var subject = renderer.Renderer{}; subject.configure("DejaVu Sans Mono", 15.5, .{ .cell_width = 11, .cell_height = 22 });
    try std.testing.expectEqualStrings("DejaVu Sans Mono", subject.font_family); try std.testing.expectEqual(@as(f32, 15.5), subject.font_size); try std.testing.expectEqual(@as(f32, 11), subject.metrics.cell_width);
}

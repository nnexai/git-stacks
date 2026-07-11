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
    (renderer.Renderer{}).render(@ptrCast(snapshot), frame, true);
    const node = c.gtk_snapshot_free_to_node(snapshot);
    try std.testing.expect(node != null);
    if (node) |value| c.gsk_render_node_unref(value);
}

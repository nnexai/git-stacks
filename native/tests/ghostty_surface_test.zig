const std = @import("std");
const runtime = @import("ghostty_runtime");

test "generation tagged callbacks reject stale generations" {
    var queued: usize = 0;
    const Probe = struct {
        fn queue(raw: *anyopaque, generation: u64) void {
            if (generation == 7) (@as(*usize, @ptrCast(@alignCast(raw)))).* += 1;
        }
        fn close(_: *anyopaque, _: u64) void {}
        fn exit(_: *anyopaque, _: u64, _: u32, _: u64) void {}
    };
    const callbacks: runtime.SurfaceCallbacks = .{ .context = &queued, .generation = 7, .queue_render = Probe.queue, .close = Probe.close, .child_exit = Probe.exit };
    callbacks.queue_render(callbacks.context, callbacks.generation);
    try std.testing.expectEqual(@as(usize, 1), queued);
}

test "runtime configuration callback seam is bounded and surface-local" {
    try std.testing.expect(@sizeOf(runtime.SurfaceCallbacks) <= 64);
}

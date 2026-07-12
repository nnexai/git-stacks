const std = @import("std");
const sync = @import("service_sync");

test "refreshes coalesce and replay cursor adopts only on success" {
    var c: sync.Coordinator = .{};
    try std.testing.expect(c.request(.{ .reason = .invalidation, .revision = 4 }));
    const first = c.begin().?;
    try std.testing.expect(!c.request(.{ .reason = .periodic, .revision = 2 }));
    try std.testing.expect(c.request(.{ .reason = .replay_gap, .revision = 7, .cursor = 99 }));
    try std.testing.expectEqual(@as(?u64, null), c.adopted_cursor);
    try std.testing.expect(c.fail(first.generation, error.RefreshFailed));
    try std.testing.expectEqual(@as(?u64, null), c.adopted_cursor);
    const trailing = c.begin().?;
    try std.testing.expectEqual(@as(u64, 7), trailing.revision);
    try std.testing.expect(c.succeed(trailing.generation, 7));
    try std.testing.expectEqual(@as(?u64, 99), c.adopted_cursor);
}

test "cancellation and stale generations are no ops" {
    var c: sync.Coordinator = .{};
    _ = c.request(.{ .reason = .manual_retry, .revision = 1 });
    const work = c.begin().?;
    try std.testing.expect(!c.succeed(work.generation + 1, 1));
    c.cancel();
    try std.testing.expect(!c.fail(work.generation, error.RefreshFailed));
    try std.testing.expect(!c.request(.{ .reason = .periodic, .revision = 2 }));
}

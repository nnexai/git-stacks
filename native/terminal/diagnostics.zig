const std = @import("std");

pub const CleanupReason = enum { absence_unproved, signal_failed, reap_failed };

/// Fixed-size, bounded lifecycle diagnostic. It intentionally contains only a
/// process-group identifier and a closed reason vocabulary; launch data never
/// reaches this boundary.
pub fn cleanupFailure(pgid: i32, reason: CleanupReason) [96]u8 {
    var out = [_]u8{0} ** 96;
    _ = std.fmt.bufPrint(&out, "terminal cleanup pgid={d} reason={s}", .{ pgid, @tagName(reason) }) catch unreachable;
    return out;
}

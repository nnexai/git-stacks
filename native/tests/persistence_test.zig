const std = @import("std");
const persistence = @import("persistence");

fn id(comptime value: []const u8) [36]u8 { return value[0..36].*; }

test "presentation allowlist contains no process or launch secrets" {
    const records = [_]persistence.Record{.{ .surface_id = id("018f47f4-5ab1-7c2d-8e90-123456789abc"), .title = "shell", .cwd_label = "repo", .last_exit_status = 0 }};
    const bytes = try persistence.encodeAlloc(std.testing.allocator, &records);
    defer std.testing.allocator.free(bytes);
    for ([_][]const u8{ "pid", "pgid", "pty", "argv", "environment", "credential", "token", "running" }) |secret| try std.testing.expect(std.mem.indexOf(u8, bytes, secret) == null);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"lifecycle\":\"ended\"") != null);
}

test "valid entries restore beside independently quarantined entries" {
    const bytes = "{\"protocol\":\"v1\",\"entries\":[{\"surface_id\":\"018f47f4-5ab1-7c2d-8e90-123456789abc\",\"title\":\"one\"},{\"title\":\"bad\"},{\"surface_id\":\"nope\"}]}";
    var restored = try persistence.restore(std.testing.allocator, bytes);
    defer restored.deinit();
    try std.testing.expectEqual(@as(usize, 1), restored.records.items.len);
    try std.testing.expectEqual(@as(usize, 2), restored.diagnostics.items.len);
    try std.testing.expectEqualStrings("missing_identity", restored.diagnostics.items[0].code);
    try std.testing.expectEqualStrings("invalid_identity", restored.diagnostics.items[1].code);
}

test "owner-only permission policy is strict" {
    try std.testing.expect(persistence.isSafeMode(0o700, true));
    try std.testing.expect(persistence.isSafeMode(0o600, false));
    try std.testing.expect(!persistence.isSafeMode(0o755, true));
    try std.testing.expect(!persistence.isSafeMode(0o644, false));
}

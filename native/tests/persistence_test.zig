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

test "pair-local order title cwd exit and lineage restore ended" {
    const bytes="{\"protocol\":\"v1\",\"entries\":[{\"surface_id\":\"018f47f4-5ab1-7c2d-8e90-123456789abc\",\"workspace_id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"repository_id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"title\":\"named\",\"cwd_label\":\"repo\",\"order\":7,\"last_exit_status\":3,\"predecessor_surface_id\":\"318f47f4-5ab1-7c2d-8e90-123456789abc\",\"lifecycle\":\"live\",\"argv\":[\"secret\"]}]}";
    var restored=try persistence.restore(std.testing.allocator,bytes); defer restored.deinit();
    const r=restored.records.items[0]; try std.testing.expectEqual(@as(u32,7),r.order); try std.testing.expectEqualStrings("named",r.title); try std.testing.expectEqual(@as(?i32,3),r.last_exit_status); try std.testing.expect(r.predecessor_surface_id != null); try std.testing.expectEqualStrings("ended",@tagName(r.lifecycle));
}

test "owner-only permission policy is strict" {
    try std.testing.expect(persistence.isSafeMode(0o700, true));
    try std.testing.expect(persistence.isSafeMode(0o600, false));
    try std.testing.expect(!persistence.isSafeMode(0o755, true));
    try std.testing.expect(!persistence.isSafeMode(0o644, false));
}

const std = @import("std");
const persistence = @import("persistence");

fn id(comptime value: []const u8) [36]u8 {
    return value[0..36].*;
}

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
    const bytes = "{\"protocol\":\"v1\",\"entries\":[{\"surface_id\":\"018f47f4-5ab1-7c2d-8e90-123456789abc\",\"workspace_id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"repository_id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"title\":\"named\",\"cwd_label\":\"repo\",\"order\":7,\"last_exit_status\":3,\"predecessor_surface_id\":\"318f47f4-5ab1-7c2d-8e90-123456789abc\",\"lifecycle\":\"live\",\"argv\":[\"secret\"]}]}";
    var restored = try persistence.restore(std.testing.allocator, bytes);
    defer restored.deinit();
    const r = restored.records.items[0];
    try std.testing.expectEqual(@as(u32, 7), r.order);
    try std.testing.expectEqualStrings("named", r.title);
    try std.testing.expectEqual(@as(?i32, 3), r.last_exit_status);
    try std.testing.expect(r.predecessor_surface_id != null);
    try std.testing.expectEqualStrings("ended", @tagName(r.lifecycle));
}

test "owner-only permission policy is strict" {
    try std.testing.expect(persistence.isSafeMode(0o700, true));
    try std.testing.expect(persistence.isSafeMode(0o600, false));
    try std.testing.expect(!persistence.isSafeMode(0o755, true));
    try std.testing.expect(!persistence.isSafeMode(0o644, false));
}

test "atomic process restart restores pair-local presentation ended and quarantines corrupt peer" {
    var tmp=std.testing.tmpDir(.{});defer tmp.cleanup();
    var root:[std.fs.max_path_bytes]u8=undefined;const dir=try tmp.dir.realpath(".",&root);var path_buf:[std.fs.max_path_bytes]u8=undefined;const path=try std.fmt.bufPrint(&path_buf,"{s}/presentation.json",.{dir});
    var before:persistence.State=.{.workspace_count=1,.pair_count=1,.pin_count=1,.organization_mode=.repository};
    before.workspaces[0]=.{.id=id("118f47f4-5ab1-7c2d-8e90-123456789abc"),.repository_count=1};before.workspaces[0].repository_ids[0]=id("218f47f4-5ab1-7c2d-8e90-123456789abc");before.pins[0]=before.workspaces[0].id;
    before.pairs[0]=.{.key=.{.workspace_id=before.workspaces[0].id,.repository_id=before.workspaces[0].repository_ids[0]},.surface_count=1};before.last_pair=before.pairs[0].key;
    before.pairs[0].surfaces[0]=.{.id=id("018f47f4-5ab1-7c2d-8e90-123456789abc"),.lifecycle=.live,.order=4,.last_exit_status=7,.predecessor_surface_id=id("318f47f4-5ab1-7c2d-8e90-123456789abc")};
    @memcpy(before.pairs[0].surfaces[0].title[0..7],"renamed");before.pairs[0].surfaces[0].title_len=7;@memcpy(before.pairs[0].surfaces[0].cwd[0..4],"repo");before.pairs[0].surfaces[0].cwd_len=4;
    try persistence.writeStateAtomic(std.testing.allocator,path,&before);
    var after:persistence.State=.{.workspace_count=1,.pair_count=1};after.workspaces[0]=before.workspaces[0];after.pairs[0]=.{.key=before.pairs[0].key};
    try std.testing.expectEqual(@as(usize,0),try persistence.restoreStateFile(std.testing.allocator,path,&after));
    const restored=after.pairs[0].surfaces[0];try std.testing.expect(restored.lifecycle==.ended);try std.testing.expectEqualStrings("renamed",restored.title[0..restored.title_len]);try std.testing.expectEqualStrings("repo",restored.cwd[0..restored.cwd_len]);try std.testing.expectEqual(@as(?i32,7),restored.last_exit_status);try std.testing.expect(restored.predecessor_surface_id!=null);
}

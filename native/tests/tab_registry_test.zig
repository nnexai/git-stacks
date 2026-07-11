const std = @import("std");
const registry = @import("tab_registry");
const model = @import("model");
fn id(comptime v: []const u8) model.Id {
    return v[0..36].*;
}
fn host(s: model.Id, p: model.PairKey, g: u64, pgid: i32) registry.Host {
    return .{ .surface_id = s, .pair = p, .generation = g, .pgid = pgid, .birth_token = g + 10 };
}
test "navigation attach detach preserves host identity generation and ownership" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    const sid = id("318f47f4-5ab1-7c2d-8e90-123456789abc");
    try r.register(host(sid, p, 7, 444));
    for (0..100) |_| {
        try r.attach(sid);
        try r.detach(sid);
    }
    const h = r.find(sid).?;
    try std.testing.expectEqual(@as(u64, 7), h.generation);
    try std.testing.expectEqual(@as(i32, 444), h.pgid);
    try std.testing.expect(h.registered);
    try std.testing.expectEqual(@as(usize, 1), r.hosts.items.len);
}
test "tab becomes live only after valid registration" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    var s: model.State = .{};
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    try std.testing.expectError(error.InvalidOwnership, registry.commitAfterRegistration(&s, &r, host(id("318f47f4-5ab1-7c2d-8e90-123456789abc"), p, 1, 0)));
    try std.testing.expectEqual(@as(u8, 0), s.pair_count);
    try registry.commitAfterRegistration(&s, &r, host(id("418f47f4-5ab1-7c2d-8e90-123456789abc"), p, 1, 555));
    try std.testing.expectEqual(@as(u8, 1), s.pairs[0].surface_count);
    try std.testing.expectEqual(model.Lifecycle.live, s.pairs[0].surfaces[0].lifecycle);
}
test "close and quit remove ownership while view detach does not" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    const a = id("318f47f4-5ab1-7c2d-8e90-123456789abc");
    try r.register(host(a, p, 1, 444));
    try r.detach(a);
    try std.testing.expectEqual(@as(usize, 1), r.hosts.items.len);
    _ = try r.close(a);
    try std.testing.expectEqual(@as(usize, 0), r.hosts.items.len);
}

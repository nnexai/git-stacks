const std = @import("std");
const registry = @import("tab_registry");
const model = @import("model");
fn id(comptime v: []const u8) model.Id {
    return v[0..36].*;
}
const Fake = struct { registered: bool=false, teardowns:u8=0, exits:u8=0, destroys:u8=0 };
fn reg(ctx:*anyopaque, _:i32, _:u64)!void { const f:*Fake=@ptrCast(@alignCast(ctx)); f.registered=true; }
fn down(ctx:*anyopaque,_:i32,_:u64)!void { const f:*Fake=@ptrCast(@alignCast(ctx)); f.registered=false;f.teardowns+=1; }
fn exited(ctx:*anyopaque,_:i32,_:u64)!void { const f:*Fake=@ptrCast(@alignCast(ctx));f.registered=false;f.exits+=1; }
fn destroy(ctx:*anyopaque)void { const f:*Fake=@ptrCast(@alignCast(ctx));f.destroys+=1; }
fn host(f:*Fake,s: model.Id, p: model.PairKey, g: u64, pgid: i32) registry.Host {
    return .{ .surface_id = s, .pair = p, .generation = g, .pgid = pgid, .birth_token = g + 10, .terminal=.{.context=f,.registerOwnership=reg,.teardown=down,.childExited=exited,.destroy=destroy} };
}
test "navigation attach detach preserves host identity generation and ownership" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    const sid = id("318f47f4-5ab1-7c2d-8e90-123456789abc");
    var f:Fake=.{}; try r.register(host(&f,sid, p, 7, 444));
    for (0..100) |_| {
        try r.attach(sid);
        try r.detach(sid);
    }
    const h = r.find(sid).?;
    try std.testing.expectEqual(@as(u64, 7), h.generation);
    try std.testing.expectEqual(@as(i32, 444), h.pgid);
    try std.testing.expect(h.registered and f.registered);
    try std.testing.expectEqual(@as(usize, 1), r.hosts.items.len);
}
test "tab becomes live only after valid registration" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    var s: model.State = .{};
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    var f:Fake=.{}; try std.testing.expectError(error.InvalidOwnership, registry.commitAfterRegistration(&s, &r, host(&f,id("318f47f4-5ab1-7c2d-8e90-123456789abc"), p, 1, 0)));
    try std.testing.expectEqual(@as(u8, 0), s.pair_count);
    try registry.commitAfterRegistration(&s, &r, host(&f,id("418f47f4-5ab1-7c2d-8e90-123456789abc"), p, 1, 555));
    try std.testing.expectEqual(@as(u8, 1), s.pairs[0].surface_count);
    try std.testing.expectEqual(model.Lifecycle.live, s.pairs[0].surfaces[0].lifecycle);
}
test "close and quit remove ownership while view detach does not" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    const p: model.PairKey = .{ .workspace_id = id("118f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("218f47f4-5ab1-7c2d-8e90-123456789abc") };
    const a = id("318f47f4-5ab1-7c2d-8e90-123456789abc");
    var f:Fake=.{}; try r.register(host(&f,a, p, 1, 444));
    try r.detach(a);
    try std.testing.expectEqual(@as(usize, 1), r.hosts.items.len);
    try r.close(a);
    try std.testing.expectEqual(@as(usize, 0), r.hosts.items.len);
    try std.testing.expectEqual(@as(u8,1),f.teardowns);
}
test "registry limits distinct live pair identities before ownership mutation" {
    var r = registry.Registry.init(std.testing.allocator);
    defer r.deinit();
    var fakes: [33]Fake = [_]Fake{.{}} ** 33;
    for (0..32) |i| {
        var workspace = id("118f47f4-5ab1-7c2d-8e90-123456789abc");
        var repository = id("218f47f4-5ab1-7c2d-8e90-123456789abc");
        var surface = id("318f47f4-5ab1-7c2d-8e90-123456789abc");
        workspace[0] = @intCast('A' + i);
        repository[0] = @intCast('A' + i);
        surface[0] = @intCast('A' + i);
        try r.register(host(&fakes[i], surface, .{ .workspace_id = workspace, .repository_id = repository }, i + 1, @intCast(500 + i)));
    }
    try std.testing.expectEqual(@as(usize, 32), r.livePairCount());
    const extra_pair: model.PairKey = .{ .workspace_id = id("z18f47f4-5ab1-7c2d-8e90-123456789abc"), .repository_id = id("z28f47f4-5ab1-7c2d-8e90-123456789abc") };
    try std.testing.expectError(error.LivePairCapacity, r.register(host(&fakes[32], id("z38f47f4-5ab1-7c2d-8e90-123456789abc"), extra_pair, 40, 900)));
    try std.testing.expect(!fakes[32].registered);
    try std.testing.expect(r.hasLivePair(extra_pair) == false);
}

const std = @import("std");
const reducer = @import("reducer");
const model = reducer.model;

fn id(comptime value: []const u8) [36]u8 {
    return value[0..36].*;
}

test "D-01 through D-04 remain deterministic" {
    const ready = reducer.reduce(.{}, .{ .connected = .{ .revision = 2, .sequence = 4 } }).state;
    try std.testing.expectEqual(model.Connection.stale, reducer.reduce(ready, .disconnected).state.connection);
    const frozen = reducer.reduce(ready, .{ .event = .{ .revision = 3, .sequence = 5 } });
    try std.testing.expectEqual(model.Connection.refresh_required, frozen.state.connection);
    try std.testing.expect(frozen.effect == .refresh_service);
    const incompatible = reducer.reduce(ready, .incompatible).state;
    try std.testing.expect(!incompatible.has_snapshot);
    const unknown = reducer.reduce(ready, .unknown_optional);
    try std.testing.expect(unknown.effect == .none);
    try std.testing.expectEqual(@as(u32, 1), unknown.state.degraded_optional_count);
}

test "duplicates gaps and relaunch identity are explicit" {
    const prior = id("018f47f4-5ab1-7c2d-8e90-123456789abc");
    const next = id("028f47f4-5ab1-7c2d-8e90-123456789abc");
    var state = model.State{ .sequence = 7, .surface = .{ .id = prior, .lifecycle = .ended } };
    state = reducer.reduce(state, .{ .event = .{ .revision = 0, .sequence = 7 } }).state;
    try std.testing.expectEqual(@as(u32, 1), state.duplicate_count);
    const relaunched = reducer.reduce(state, .{ .relaunch = .{ .new_surface_id = next } });
    try std.testing.expectEqual(next, relaunched.state.surface.?.id);
    try std.testing.expectEqual(prior, relaunched.state.surface.?.predecessor_surface_id.?);
    try std.testing.expect(relaunched.effect == .terminal_create);
}

test "direct canonical snapshot matches the ABI canonical vocabulary" {
    const result = reducer.reduce(.{}, .unknown_optional);
    const bytes = try model.canonicalAlloc(std.testing.allocator, result.state);
    defer std.testing.allocator.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"degraded_optional_count\":1") != null);
}

test "cleanup outcomes require matching stable identity and generation" {
    const surface_id = id("018f47f4-5ab1-7c2d-8e90-123456789abc");
    var state = model.State{ .surface = .{ .id = surface_id, .generation = 9, .lifecycle = .live } };
    const late = reducer.reduce(state, .{ .terminal_ended = .{ .surface_id = surface_id, .generation = 8 } });
    try std.testing.expectEqual(model.Lifecycle.live, late.state.surface.?.lifecycle);
    try std.testing.expect(late.effect == .none);

    const failed = reducer.reduce(state, .{ .terminal_failed_cleanup = .{ .surface_id = surface_id, .generation = 9 } });
    try std.testing.expectEqual(model.Lifecycle.failed_cleanup, failed.state.surface.?.lifecycle);
    try std.testing.expect(failed.effect == .persist);

    state = failed.state;
    const ended_late = reducer.reduce(state, .{ .terminal_ended = .{ .surface_id = surface_id, .generation = 9 } });
    try std.testing.expectEqual(model.Lifecycle.failed_cleanup, ended_late.state.surface.?.lifecycle);
}

const std = @import("std");
const app_graph = @import("app_graph");
const model = @import("model");

fn id(comptime value: []const u8) model.Id {
    return value[0..36].*;
}

fn stateWithSurface() model.State {
    const workspace = id("118f47f4-5ab1-7c2d-8e90-123456789abc");
    const repository = id("218f47f4-5ab1-7c2d-8e90-123456789abc");
    var state: model.State = .{ .workspace_count = 1, .pair_count = 1 };
    state.workspaces[0] = .{ .id = workspace, .repository_count = 1 };
    state.workspaces[0].repository_ids[0] = repository;
    state.pairs[0] = .{ .key = .{ .workspace_id = workspace, .repository_id = repository }, .surface_count = 1 };
    state.pairs[0].surfaces[0] = .{ .id = id("318f47f4-5ab1-7c2d-8e90-123456789abc"), .lifecycle = .live };
    return state;
}

test "production graph starts authenticated service and injects terminal registry" {
    var graph = try app_graph.ProductionGraph.init(std.testing.allocator, "native-secret");
    defer graph.deinit();

    try graph.assertWired();
    try std.testing.expectEqualStrings("Bearer native-secret", graph.authorization);
    try std.testing.expectEqual(@as(usize, 0), graph.terminalRegistry().hosts.items.len);
    try std.testing.expect(graph.terminalRegistry() == &graph.terminals);
}

test "production graph remains constructible before service discovery is configured" {
    var graph = try app_graph.ProductionGraph.init(std.testing.allocator, null);
    defer graph.deinit();

    try graph.assertWired();
    try std.testing.expectEqualStrings("", graph.authorization);
}

test "native OSC attention survives authoritative refresh and lifecycle updates" {
    var graph = try app_graph.ProductionGraph.init(std.testing.allocator, null);
    defer graph.deinit();
    graph.state = stateWithSurface();

    var local: model.Attention = .{ .id = id("a18f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = graph.state.workspaces[0].id, .repository_id = graph.state.pairs[0].key.repository_id, .surface_id = graph.state.pairs[0].surfaces[0].id, .provider = .codex, .status = .working };
    const key = "osc:318f47f4-5ab1-7c2d-8e90-123456789abc:codex";
    @memcpy(local.service_id[0..key.len], key);
    local.service_id_len = key.len;
    graph.state.attention[0] = local;
    graph.state.attention_count = 1;

    try graph.applyAuthoritativeSnapshot(stateWithSurface());
    try std.testing.expectEqual(@as(u8, 1), graph.state.attention_count);
    try std.testing.expectEqual(model.AttentionStatus.working, graph.state.attention[0].status);

    graph.state.attention[0].status = .completed;
    try graph.applyAuthoritativeSnapshot(stateWithSurface());
    try std.testing.expectEqual(@as(u8, 1), graph.state.attention_count);
    try std.testing.expectEqual(model.AttentionStatus.completed, graph.state.attention[0].status);
}

test "native OSC attention expires when its exact surface is gone" {
    var graph = try app_graph.ProductionGraph.init(std.testing.allocator, null);
    defer graph.deinit();
    graph.state = stateWithSurface();
    var local: model.Attention = .{ .id = id("c18f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = graph.state.workspaces[0].id, .surface_id = graph.state.pairs[0].surfaces[0].id, .provider = .copilot, .status = .waiting };
    const key = "osc:318f47f4-5ab1-7c2d-8e90-123456789abc:copilot";
    @memcpy(local.service_id[0..key.len], key);
    local.service_id_len = key.len;
    graph.state.attention[0] = local;
    graph.state.attention_count = 1;
    // This is the state after the explicit tab-close transaction has removed
    // the surface but before the next service refresh arrives.
    graph.state.pairs[0].surface_count = 0;
    var without_surface = stateWithSurface();
    without_surface.pairs[0].surface_count = 0;
    try graph.applyAuthoritativeSnapshot(without_surface);
    try std.testing.expectEqual(@as(u8, 0), graph.state.attention_count);
}

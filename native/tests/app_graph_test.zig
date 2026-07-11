const std = @import("std");
const app_graph = @import("app_graph");

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

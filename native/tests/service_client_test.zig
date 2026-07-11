const std = @import("std");
const service = @import("service_client");
test "authenticated discovery snapshot replay duplicates gaps reconnect and shutdown" {
    var c = service.Client.init("Bearer secret");
    c.begin();
    try std.testing.expectEqual(service.Connection.discovering, c.state);
    _ = try c.acceptDiscovery(200, "{\"protocol\":\"v1\",\"request_id\":\"req_1234567890123456\",\"ok\":true,\"data\":{\"service_version\":\"1\",\"capabilities\":{\"workspace_snapshots\":{},\"operations\":{},\"attention_events\":{},\"native_launch_resolution\":{},\"structured_attention\":{}},\"limits\":{\"request_body_bytes\":1,\"subscriber_events\":1,\"subscriber_bytes\":1}}}");
    try std.testing.expectEqual(service.Connection.snapshot_loading, c.state);
    _ = c.acceptSnapshot(4, 8);
    try std.testing.expect(c.acceptEvent(8) == .duplicate);
    try std.testing.expect(c.acceptEvent(9) == .event);
    try std.testing.expect(c.acceptEvent(11) == .gap_refresh);
    try std.testing.expectEqual(service.Connection.refresh_required, c.state);
    try std.testing.expectEqual(@as(u64, 250), c.backoffMs());
    try std.testing.expectEqual(@as(u64, 500), c.backoffMs());
    c.shutdown();
    try std.testing.expectError(error.Cancelled, c.acceptDiscovery(200, "{\"protocol\":\"v1\"}"));
}
test "requests carry bearer credential revision identities and replay cursor" {
    var c = service.Client.init("Bearer secret");
    const discovery = try c.discoveryRequest();
    try std.testing.expectEqual(service.Method.GET, discovery.method);
    try std.testing.expectEqualStrings("/v1/discovery", discovery.path);
    try std.testing.expectEqualStrings("Bearer secret", discovery.authorization);
    c.revision = 19; c.sequence = 42;
    var cursor: [20]u8 = undefined;
    const events = try c.eventsRequest(&cursor);
    try std.testing.expectEqualStrings("42", events.last_event_id.?);
    const launch = try c.launchRequestAlloc(std.testing.allocator, "118f47f4-5ab1-7c2d-8e90-123456789abc", "218f47f4-5ab1-7c2d-8e90-123456789abc", null);
    defer std.testing.allocator.free(launch.body);
    try std.testing.expect(std.mem.indexOf(u8, launch.body, "\"expected_revision\":\"19\"") != null);
    try std.testing.expectEqual(service.Method.POST, launch.method);
}
test "SSE validates cursor and enforces ordering" {
    var c = service.Client.init("Bearer secret"); c.sequence = 7;
    const event = c.acceptSse("id: 8\ndata: {\"protocol\":\"v1\",\"sequence\":\"8\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"control\",\"control\":{\"kind\":\"heartbeat\"}}\n\n");
    try std.testing.expect(event == .event);
    try std.testing.expect(c.acceptSse("id: 10\ndata: {\"protocol\":\"v1\",\"sequence\":\"10\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"control\",\"control\":{\"kind\":\"heartbeat\"}}\n\n") == .gap_refresh);
}
test "incompatible and authentication states stay explicit" {
    var c = service.Client.init("Bearer secret");
    try std.testing.expect((try c.acceptDiscovery(401, "{}")) == .failure);
    try std.testing.expect((try c.acceptDiscovery(200, "{\"protocol\":\"v2\"}")) == .incompatible);
}
test "launch decoding is strict and failure contains no executable context" {
    var c = service.Client.init("Bearer secret");
    const ok = try c.resolveLaunch(200, "{\"resolved\":true,\"revision\":\"4\",\"launch\":{\"argv\":[\"sh\",\"-l\"],\"cwd\":\"/repo\",\"environment\":{},\"ports\":{},\"configuration\":{\"shell\":true},\"redacted\":[]}}");
    try std.testing.expectEqual(@as(u8, 2), ok.launch.argv_count);
    try std.testing.expectEqualStrings("/repo", ok.launch.cwdSlice());
    try std.testing.expectEqualStrings("sh", ok.launch.arg(0));
    const failed = try c.resolveLaunch(200, "{\"resolved\":false,\"error\":{\"code\":\"not_found\"}}");
    try std.testing.expect(failed == .failure);
}

const std = @import("std");
const service = @import("service_client");
test "authenticated discovery snapshot replay duplicates gaps reconnect and shutdown" {
    var c = service.Client.init("Bearer secret");
    c.begin();
    try std.testing.expectEqual(service.Connection.discovering, c.state);
    _ = try c.acceptDiscovery(200, "{\"protocol\":\"v1\"}");
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
test "incompatible and authentication states stay explicit" {
    var c = service.Client.init("Bearer secret");
    try std.testing.expect((try c.acceptDiscovery(401, "{}")) == .failure);
    try std.testing.expect((try c.acceptDiscovery(200, "{\"protocol\":\"v2\"}")) == .incompatible);
}
test "launch decoding is strict and failure contains no executable context" {
    var c = service.Client.init("Bearer secret");
    const ok = try c.resolveLaunch(200, "{\"resolved\":true,\"launch\":{\"argv\":[\"sh\",\"-l\"],\"cwd\":\"/repo\"}}");
    try std.testing.expectEqual(@as(usize, 2), ok.launch.argv_count);
    try std.testing.expectEqualStrings("/repo", ok.launch.cwdSlice());
    const failed = try c.resolveLaunch(200, "{\"resolved\":false,\"error\":{\"code\":\"not_found\"}}");
    try std.testing.expect(failed == .failure);
}

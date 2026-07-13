const std = @import("std");
const service = @import("service_client");
test "authenticated discovery snapshot replay duplicates gaps reconnect and shutdown" {
    var c = service.Client.init("Bearer secret");
    c.begin();
    try std.testing.expectEqual(service.Connection.discovering, c.state);
    const discovery = try std.fs.cwd().readFileAlloc(std.testing.allocator, "tests/fixtures/discovery.json", 64 * 1024);
    defer std.testing.allocator.free(discovery);
    _ = try c.acceptDiscovery(200, discovery);
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
    try std.testing.expectEqualStrings("/v1", discovery.path);
    try std.testing.expectEqualStrings("Bearer secret", discovery.authorization);
    c.revision = 19;
    c.sequence = 42;
    var cursor: [20]u8 = undefined;
    const events = try c.eventsRequest(&cursor);
    try std.testing.expectEqualStrings("42", events.last_event_id.?);
    const launch = try c.launchRequestAlloc(std.testing.allocator, "118f47f4-5ab1-7c2d-8e90-123456789abc", "218f47f4-5ab1-7c2d-8e90-123456789abc", null, 19);
    defer std.testing.allocator.free(launch.body);
    try std.testing.expect(std.mem.indexOf(u8, launch.body, "\"expected_revision\":\"19\"") != null);
    try std.testing.expectEqual(service.Method.POST, launch.method);
}
test "creation requests carry explicit JSON and idempotency headers" {
    var c = service.Client.init("Bearer secret");
    const catalog = try c.creationCatalogRequest();
    try std.testing.expectEqualStrings("/v1/workspace-creation/catalog", catalog.path);
    const create = try c.workspaceCreateRequest("{}", "idem_1234567890123456");
    try std.testing.expectEqualStrings("/v1/operations/workspace.create", create.path);
    try std.testing.expectEqualStrings("application/json", create.content_type.?);
    try std.testing.expectEqualStrings("idem_1234567890123456", create.idempotency_key.?);
    var path: [96]u8 = undefined;
    const operation = try c.operationRequest("op_1234567890123456", &path);
    try std.testing.expectEqualStrings("/v1/operations/op_1234567890123456", operation.path);
}
test "replay gap adopts server cursor only after recovery" {
    var c = service.Client.init("Bearer secret"); c.sequence = 7;
    const recovery = try service.Client.decodeReplayGap(409, "{\"error\":{\"code\":\"replay_gap\",\"details\":{\"requested\":\"7\",\"oldest_available\":\"10\",\"newest_available\":\"20\",\"latest_cursor\":\"20\",\"snapshot_revision\":\"9\"}}}");
    try std.testing.expectEqual(@as(u64, 7), c.sequence);
    c.adoptReplayGap(recovery);
    try std.testing.expectEqual(@as(u64, 20), c.sequence);
    try std.testing.expectEqual(@as(u64, 9), c.revision);
}
test "SSE validates cursor and enforces ordering" {
    var c = service.Client.init("Bearer secret");
    c.sequence = 7;
    const event = c.acceptSse("id: 8\ndata: {\"protocol\":\"v1\",\"sequence\":\"8\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"control\",\"control\":{\"kind\":\"heartbeat\"}}\n\n");
    try std.testing.expect(event == .event);
    try std.testing.expect(c.acceptSse("id: 10\ndata: {\"protocol\":\"v1\",\"sequence\":\"10\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"control\",\"control\":{\"kind\":\"heartbeat\"}}\n\n") == .gap_refresh);
}
const ServerContext = struct { server: *std.net.Server, saw_auth: bool = false };
fn serveOnce(ctx: *ServerContext) void {
    const connection = ctx.server.accept() catch return;
    defer connection.stream.close();
    var request: [4096]u8 = undefined;
    const n = connection.stream.read(&request) catch return;
    ctx.saw_auth = std.mem.indexOf(u8, request[0..n], "authorization: Bearer secret") != null;
    connection.stream.writeAll("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}") catch {};
}
test "std.http transport performs authenticated loopback IO" {
    const address = try std.net.Address.parseIp4("127.0.0.1", 0);
    var server = try address.listen(.{});
    defer server.deinit();
    var context = ServerContext{ .server = &server };
    const thread = try std.Thread.spawn(.{}, serveOnce, .{&context});
    var transport = service.HttpTransport.init(std.testing.allocator);
    defer transport.deinit();
    var url: [64]u8 = undefined;
    const endpoint = try std.fmt.bufPrint(&url, "http://127.0.0.1:{d}", .{server.listen_address.getPort()});
    const response = try transport.execute(endpoint, .{ .method = .GET, .path = "/v1", .authorization = "Bearer secret" });
    defer response.deinit(std.testing.allocator);
    thread.join();
    try std.testing.expectEqual(@as(u16, 200), response.status);
    try std.testing.expectEqualStrings("{}", response.body);
    try std.testing.expect(context.saw_auth);
}
test "secure descriptor and credential discovery rejects unsafe authority" {
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.makeDir("credentials");
    var credentials = try tmp.dir.openDir("credentials", .{});
    defer credentials.close();
    {
        var f = try tmp.dir.createFile("descriptor.json", .{ .mode = 0o600 });
        defer f.close();
        try f.writeAll("{\"protocol\":\"v1\",\"endpoint\":\"http://127.0.0.1:7777/\",\"pid\":1,\"instance_id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"server_id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"credential_lookup\":\"official-client\",\"started_at\":\"2026-01-01T00:00:00Z\"}");
    }
    {
        var f = try credentials.createFile("official-client.json", .{ .mode = 0o600 });
        defer f.close();
        try f.writeAll("{\"clientId\":\"official-client\",\"token\":\"secret\",\"createdAt\":\"2026-01-01T00:00:00Z\"}");
    }
    var root: [std.fs.max_path_bytes]u8 = undefined;
    const service_root = try tmp.dir.realpath(".", &root);
    try std.posix.fchmodat(std.posix.AT.FDCWD, service_root, 0o700, 0);
    var credentials_path: [std.fs.max_path_bytes]u8 = undefined;
    const cp = try std.fmt.bufPrint(&credentials_path, "{s}/credentials", .{service_root});
    try std.posix.fchmodat(std.posix.AT.FDCWD, cp, 0o700, 0);
    const access = try service.discoverAccess(service_root);
    try std.testing.expectEqualStrings("http://127.0.0.1:7777/", access.endpointSlice());
    try std.testing.expectEqualStrings("Bearer secret", access.authorizationSlice());
}
test "aggregate snapshot decodes normalized workspace repository pairs into reducer action" {
    var c = service.Client.init("Bearer secret");
    const action = try c.decodeAggregateSnapshot("{\"protocol\":\"v1\",\"request_id\":\"req_1234567890123456\",\"ok\":true,\"data\":[{\"protocol\":\"v1\",\"request_id\":\"req_abcdefghijklmnop\",\"ok\":true,\"revision\":\"9\",\"generated_at\":\"2026-01-01T00:00:00Z\",\"workspace\":{\"id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"name\":\"feature\",\"labels\":[\"client\"],\"repositories\":[{\"id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"name\":\"repo\"}]}}]}");
    try std.testing.expect(action == .snapshot);
    try std.testing.expectEqual(@as(u8, 1), action.snapshot.workspace_count);
    try std.testing.expectEqual(@as(u8, 1), action.snapshot.pair_count);
    try std.testing.expectEqual(@as(u64, 9), action.snapshot.revision);
    try std.testing.expectEqual(@as(u8, 1), action.snapshot.workspaces[0].label_count);
    try std.testing.expectEqualStrings("client", action.snapshot.workspaces[0].labels[0][0..action.snapshot.workspaces[0].label_lens[0]]);
}
test "aggregate snapshot decodes bounded repository presentation by stable identity" {
    var c = service.Client.init("Bearer secret");
    const body = "{\"protocol\":\"v1\",\"request_id\":\"req_1234567890123456\",\"ok\":true,\"data\":[{\"revision\":\"9\",\"workspace\":{\"id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"name\":\"feature\",\"repositories\":[{\"id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"name\":\"repo\"}],\"status\":[{\"repository_id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"branch\":\"topic\",\"default_branch\":\"main\",\"exists\":true,\"dirty\":true,\"degraded\":false,\"ahead\":2,\"behind\":1,\"additions\":12,\"removals\":4,\"remote\":\"available\",\"pull_request\":{\"number\":42,\"state\":\"open\",\"checks\":\"passing\"}}]}}]}";
    const action = try c.decodeAggregateSnapshot(body);
    const repo = action.snapshot.workspaces[0].repositories[0];
    const p = repo.presentation.?;
    try std.testing.expectEqualStrings("topic", p.branch[0..p.branch_len]);
    try std.testing.expectEqual(@as(u64, 12), p.additions);
    try std.testing.expectEqual(@as(u32, 42), p.pull_request.?.number);
    try std.testing.expect(p.pull_request.?.checks.? == .passing);

    const bad = std.mem.replaceOwned(u8, std.testing.allocator, body, "\"available\"", "\"unknown\"") catch unreachable;
    defer std.testing.allocator.free(bad);
    try std.testing.expectError(error.Invalid, c.decodeAggregateSnapshot(bad));
}
test "activity SSE signal retains service identity and valid UTF-8 content" {
    var c = service.Client.init("Bearer secret");
    c.sequence = 10;
    const action = try c.decodeSseReducerAction("id: 11\ndata: {\"protocol\":\"v1\",\"sequence\":\"11\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"signal\",\"signal\":{\"version\":1,\"kind\":\"activity\",\"id\":\"sig_1234567890123456\",\"state\":\"failed\",\"workspace_id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"repository_id\":\"218f47f4-5ab1-7c2d-8e90-123456789abc\",\"surface_id\":\"318f47f4-5ab1-7c2d-8e90-123456789abc\",\"session_id\":\"codex-a\",\"source\":\"codex\",\"title\":\"Codex needs ✓\",\"detail\":\"Review café\",\"occurred_at\":\"2026-01-01T00:00:00Z\"}}\n\n");
    try std.testing.expect(action == .signal_received);
    try std.testing.expectEqualStrings("sig_1234567890123456", action.signal_received.signal_id[0..action.signal_received.signal_id_len]);
    try std.testing.expectEqual(@as(u8, 2), @intFromEnum(action.signal_received.provider));
    try std.testing.expectEqualStrings("Codex needs ✓", action.signal_received.title[0..action.signal_received.title_len]);
    try std.testing.expectEqualStrings("Review café", action.signal_received.detail[0..action.signal_received.detail_len]);
    try std.testing.expectEqualStrings("2026-01-01T00:00:00Z", action.signal_received.occurred_at[0..action.signal_received.occurred_at_len]);
}
test "notification signal becomes unread workspace notification" {
    var c = service.Client.init("Bearer secret");
    c.sequence = 20;
    const action = try c.decodeSseReducerAction("id: 21\ndata: {\"protocol\":\"v1\",\"sequence\":\"21\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"type\":\"signal\",\"signal\":{\"version\":1,\"kind\":\"notification\",\"id\":\"sig_2234567890123456\",\"workspace_id\":\"118f47f4-5ab1-7c2d-8e90-123456789abc\",\"source\":\"automation\",\"title\":\"Agent finished\",\"occurred_at\":\"2026-01-01T00:00:00Z\"}}\n\n");
    try std.testing.expect(action == .signal_received);
    try std.testing.expect(action.signal_received.status == .waiting);
    try std.testing.expectEqualStrings("118f47f4-5ab1-7c2d-8e90-123456789abc", &action.signal_received.workspace_id);
}
test "incompatible and authentication states stay explicit" {
    var c = service.Client.init("Bearer secret");
    try std.testing.expect((try c.acceptDiscovery(401, "{}")) == .failure);
    try std.testing.expect((try c.acceptDiscovery(200, "{\"protocol\":\"v2\"}")) == .incompatible);
}
test "launch decoding is strict and failure contains no executable context" {
    var c = service.Client.init("Bearer secret");
    const ok = try c.resolveLaunch(200, "{\"resolved\":true,\"revision\":\"4\",\"launch\":{\"argv\":[\"sh\",\"-l\"],\"cwd\":\"/repo\",\"environment\":{\"TERM\":\"xterm-ghostty\"},\"ports\":{\"dev\":4173},\"configuration\":{\"shell\":true},\"redacted\":[]}}");
    try std.testing.expectEqual(@as(u8, 2), ok.launch.argv_count);
    try std.testing.expectEqualStrings("/repo", ok.launch.cwdSlice());
    try std.testing.expectEqualStrings("sh", ok.launch.arg(0));
    try std.testing.expectEqualStrings("TERM", ok.launch.environmentKey(0));
    try std.testing.expectEqualStrings("xterm-ghostty", ok.launch.environmentValue(0));
    try std.testing.expectEqual(@as(u16, 4173), ok.launch.port_values[0]);
    const failed = try c.resolveLaunch(200, "{\"resolved\":false,\"error\":{\"code\":\"not_found\"}}");
    try std.testing.expect(failed == .failure);
}
test "launch decoding accepts negotiated developer environment values beyond 512 bytes" {
    var c = service.Client.init("Bearer secret");
    const value = "x" ** 700;
    const body = try std.fmt.allocPrint(std.testing.allocator, "{{\"resolved\":true,\"revision\":\"4\",\"launch\":{{\"argv\":[\"sh\"],\"cwd\":\"/repo\",\"environment\":{{\"PATH\":\"{s}\"}},\"ports\":{{}},\"configuration\":{{\"shell\":true}},\"redacted\":[]}}}}", .{value});
    defer std.testing.allocator.free(body);
    const outcome = try c.resolveLaunch(200, body);
    try std.testing.expect(outcome == .launch);
    try std.testing.expectEqual(@as(usize, 700), outcome.launch.environmentValue(0).len);
}

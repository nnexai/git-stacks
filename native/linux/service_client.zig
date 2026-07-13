const std = @import("std");
const model = @import("model");
const reducer = @import("reducer");

pub const Connection = enum { disconnected, discovering, snapshot_loading, replaying, ready, refresh_required, incompatible, failed, shutting_down };
pub const Method = enum { GET, POST };
pub const Request = struct { method: Method, path: []const u8, authorization: []const u8, body: []const u8 = "", last_event_id: ?[]const u8 = null, content_type: ?[]const u8 = null, idempotency_key: ?[]const u8 = null };
pub const ReplayGapRecovery = struct { requested: u64, oldest_available: u64, newest_available: u64, latest_cursor: u64, snapshot_revision: u64 };
pub const Response = struct {
    status: u16,
    body: []u8,
    pub fn deinit(self: Response, a: std.mem.Allocator) void {
        a.free(self.body);
    }
};
pub const ServiceAccess = struct {
    endpoint: [256]u8 = [_]u8{0} ** 256,
    endpoint_len: u16 = 0,
    authorization: [256]u8 = [_]u8{0} ** 256,
    authorization_len: u16 = 0,
    pub fn endpointSlice(self: *const ServiceAccess) []const u8 {
        return self.endpoint[0..self.endpoint_len];
    }
    pub fn authorizationSlice(self: *const ServiceAccess) []const u8 {
        return self.authorization[0..self.authorization_len];
    }
};
pub const Snapshot = struct { revision: u64, sequence: u64, workspace_id: [36]u8 };
pub const Event = struct { sequence: u64, kind: enum { signal, operation, heartbeat } };
pub const Outcome = union(enum) { none, snapshot: Snapshot, event: Event, duplicate, gap_refresh, incompatible, failure: []const u8, launch: Launch };

pub const Launch = struct {
    argv: [32][256]u8 = undefined,
    argv_lens: [32]u16 = [_]u16{0} ** 32,
    argv_count: u8 = 0,
    cwd: [512]u8 = [_]u8{0} ** 512,
    cwd_len: u16 = 0,
    environment_keys: [64][128]u8 = undefined,
    environment_key_lens: [64]u8 = [_]u8{0} ** 64,
    environment_values: [64][4096]u8 = undefined,
    environment_value_lens: [64]u16 = [_]u16{0} ** 64,
    environment_count: u8 = 0,
    port_keys: [32][128]u8 = undefined,
    port_key_lens: [32]u8 = [_]u8{0} ** 32,
    port_values: [32]u16 = [_]u16{0} ** 32,
    port_count: u8 = 0,
    redacted_count: u16 = 0,
    revision: u64 = 0,
    shell: bool = false,
    command_id: [64]u8 = [_]u8{0} ** 64,
    command_id_len: u8 = 0,
    pub fn cwdSlice(self: *const Launch) []const u8 {
        return self.cwd[0..self.cwd_len];
    }
    pub fn arg(self: *const Launch, index: usize) []const u8 {
        return self.argv[index][0..self.argv_lens[index]];
    }
    pub fn environmentKey(self: *const Launch, index: usize) []const u8 {
        return self.environment_keys[index][0..self.environment_key_lens[index]];
    }
    pub fn environmentValue(self: *const Launch, index: usize) []const u8 {
        return self.environment_values[index][0..self.environment_value_lens[index]];
    }
    pub fn portKey(self: *const Launch, index: usize) []const u8 {
        return self.port_keys[index][0..self.port_key_lens[index]];
    }
};

pub const HttpTransport = struct {
    allocator: std.mem.Allocator,
    http: std.http.Client,
    cancelled: bool = false,
    pub fn init(allocator: std.mem.Allocator) HttpTransport {
        return .{ .allocator = allocator, .http = .{ .allocator = allocator } };
    }
    pub fn deinit(self: *HttpTransport) void {
        self.http.deinit();
    }
    /// Cooperative cancellation only. The owner that is executing requests is
    /// solely responsible for deinitializing std.http.Client.
    pub fn cancel(self: *HttpTransport) void {
        self.cancelled = true;
    }
    pub fn execute(self: *HttpTransport, endpoint: []const u8, request_value: Request) !Response {
        if (self.cancelled) return error.Cancelled;
        if (!loopbackEndpoint(endpoint)) return error.NonLoopbackEndpoint;
        const url = try std.fmt.allocPrint(self.allocator, "{s}{s}", .{ std.mem.trimRight(u8, endpoint, "/"), request_value.path });
        defer self.allocator.free(url);
        var output: std.Io.Writer.Allocating = .init(self.allocator);
        defer output.deinit();
        const auth = std.http.Header{ .name = "authorization", .value = request_value.authorization };
        var headers: [4]std.http.Header = undefined;
        var count: usize = 0;
        headers[count] = auth; count += 1;
        if (request_value.last_event_id) |value| { headers[count] = .{ .name = "last-event-id", .value = value }; count += 1; }
        if (request_value.content_type) |value| { headers[count] = .{ .name = "content-type", .value = value }; count += 1; }
        if (request_value.idempotency_key) |value| { headers[count] = .{ .name = "idempotency-key", .value = value }; count += 1; }
        const result = try self.http.fetch(.{ .location = .{ .url = url }, .method = if (request_value.method == .GET) .GET else .POST, .payload = if (request_value.body.len == 0) null else request_value.body, .extra_headers = headers[0..count], .response_writer = &output.writer, .keep_alive = false });
        return .{ .status = @intFromEnum(result.status), .body = try self.allocator.dupe(u8, output.written()) };
    }
};

pub fn discoverAccess(service_root: []const u8) !ServiceAccess {
    try protectedDirectory(service_root);
    var descriptor_path: [std.fs.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&descriptor_path, "{s}/descriptor.json", .{std.mem.trimRight(u8, service_root, "/")});
    const descriptor_bytes = try readProtected(path, 0o600, 64 * 1024);
    defer std.heap.page_allocator.free(descriptor_bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, descriptor_bytes, .{});
    defer parsed.deinit();
    if (parsed.value != .object or !exactKeys(parsed.value.object, &.{ "protocol", "endpoint", "pid", "instance_id", "server_id", "credential_lookup", "started_at" })) return error.InvalidDescriptor;
    const o = parsed.value.object;
    if (!std.mem.eql(u8, string(o, "protocol") orelse return error.InvalidDescriptor, "v1")) return error.InvalidDescriptor;
    const endpoint = string(o, "endpoint") orelse return error.InvalidDescriptor;
    if (!loopbackEndpoint(endpoint) or endpoint.len > 256) return error.InvalidDescriptor;
    const lookup = string(o, "credential_lookup") orelse return error.InvalidDescriptor;
    if (!safeClientId(lookup)) return error.InvalidDescriptor;
    const pid = o.get("pid") orelse return error.InvalidDescriptor;
    if (pid != .integer or pid.integer <= 0) return error.InvalidDescriptor;
    var credential_path: [std.fs.max_path_bytes]u8 = undefined;
    var credentials_path: [std.fs.max_path_bytes]u8 = undefined;
    const credentials_dir = try std.fmt.bufPrint(&credentials_path, "{s}/credentials", .{std.mem.trimRight(u8, service_root, "/")});
    try protectedDirectory(credentials_dir);
    const cp = try std.fmt.bufPrint(&credential_path, "{s}/credentials/{s}.json", .{ std.mem.trimRight(u8, service_root, "/"), lookup });
    const credential_bytes = try readProtected(cp, 0o600, 64 * 1024);
    defer std.heap.page_allocator.free(credential_bytes);
    const cred = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, credential_bytes, .{});
    defer cred.deinit();
    if (cred.value != .object or !exactKeys(cred.value.object, &.{ "clientId", "token", "createdAt" }) and !exactKeys(cred.value.object, &.{ "clientId", "token", "createdAt", "revokedAt" })) return error.InvalidCredential;
    if (cred.value.object.get("revokedAt") != null) return error.RevokedCredential;
    const cid = string(cred.value.object, "clientId") orelse return error.InvalidCredential;
    if (!std.mem.eql(u8, cid, lookup)) return error.InvalidCredential;
    const token = string(cred.value.object, "token") orelse return error.InvalidCredential;
    if (token.len == 0 or token.len + 7 > 256) return error.InvalidCredential;
    var result: ServiceAccess = .{ .endpoint_len = @intCast(endpoint.len), .authorization_len = @intCast(token.len + 7) };
    @memcpy(result.endpoint[0..endpoint.len], endpoint);
    @memcpy(result.authorization[0..7], "Bearer ");
    @memcpy(result.authorization[7 .. token.len + 7], token);
    return result;
}

fn readProtected(path: []const u8, mode: u32, limit: usize) ![]u8 {
    const file = try std.fs.openFileAbsolute(path, .{});
    defer file.close();
    const st = try std.posix.fstat(file.handle);
    if ((st.mode & 0o777) != mode or st.uid != std.posix.getuid() or (st.mode & std.posix.S.IFMT) != std.posix.S.IFREG) return error.UnsafeFile;
    return try file.readToEndAlloc(std.heap.page_allocator, limit);
}
fn protectedDirectory(path: []const u8) !void {
    var dir = try std.fs.openDirAbsolute(path, .{ .no_follow = true });
    defer dir.close();
    const st = try std.posix.fstat(dir.fd);
    if ((st.mode & 0o777) != 0o700 or st.uid != std.posix.getuid() or (st.mode & std.posix.S.IFMT) != std.posix.S.IFDIR) return error.UnsafeDirectory;
}
fn safeClientId(v: []const u8) bool {
    if (v.len == 0 or v.len > 128 or !std.ascii.isAlphanumeric(v[0])) return false;
    for (v[1..]) |c| if (!std.ascii.isAlphanumeric(c) and c != '.' and c != '_' and c != '-') return false;
    return true;
}
fn loopbackEndpoint(v: []const u8) bool {
    return std.mem.startsWith(u8, v, "http://127.0.0.1:") or std.mem.startsWith(u8, v, "http://localhost:") or std.mem.startsWith(u8, v, "http://[::1]:");
}

pub const Client = struct {
    state: Connection = .disconnected,
    sequence: u64 = 0,
    revision: u64 = 0,
    attempt: u8 = 0,
    cancelled: bool = false,
    authorization: []const u8,
    pub fn init(token: []const u8) Client {
        return .{ .authorization = token };
    }
    pub fn begin(self: *Client) void {
        self.state = .discovering;
        self.cancelled = false;
    }
    pub fn shutdown(self: *Client) void {
        self.cancelled = true;
        self.state = .shutting_down;
    }
    pub fn backoffMs(self: *Client) u64 {
        const shift: u6 = @intCast(@min(self.attempt, 6));
        self.attempt +|= 1;
        return @min(@as(u64, 250) << shift, 10_000);
    }
    fn request(self: *Client, method: Method, path: []const u8, body: []const u8) !Request {
        if (self.cancelled) return error.Cancelled;
        if (!std.mem.startsWith(u8, self.authorization, "Bearer ") or self.authorization.len <= 7) return error.MissingCredential;
        return .{ .method = method, .path = path, .authorization = self.authorization, .body = body };
    }
    pub fn discoveryRequest(self: *Client) !Request {
        return self.request(.GET, "/v1", "");
    }
    pub fn aggregateSnapshotRequest(self: *Client) !Request {
        return self.request(.GET, "/v1/snapshot", "");
    }
    pub fn creationCatalogRequest(self: *Client) !Request { return self.request(.GET, "/v1/workspace-creation/catalog", ""); }
    pub fn dismissSignalRequestAlloc(self: *Client, allocator: std.mem.Allocator, signal_id: []const u8) !Request {
        if (!prefixed(signal_id, "sig_") or signal_id.len > 64) return error.InvalidIdentity;
        const body = try std.fmt.allocPrint(allocator, "{{\"kind\":\"dismiss_signal\",\"signal_id\":\"{s}\"}}", .{signal_id});
        var result = try self.request(.POST, "/v1/signals/dismiss", body); result.content_type = "application/json"; return result;
    }
    pub fn operationRequest(self: *Client, operation_id: []const u8, path: *[96]u8) !Request {
        if (!prefixed(operation_id, "op_")) return error.InvalidIdentity;
        return self.request(.GET, try std.fmt.bufPrint(path, "/v1/operations/{s}", .{operation_id}), "");
    }
    pub fn workspaceCreateRequest(self: *Client, body: []const u8, idempotency_key: []const u8) !Request {
        if (!prefixed(idempotency_key, "idem_")) return error.InvalidIdentity;
        var result = try self.request(.POST, "/v1/operations/workspace.create", body);
        result.content_type = "application/json";
        result.idempotency_key = idempotency_key;
        return result;
    }
    pub fn adoptReplayGap(self: *Client, recovery: ReplayGapRecovery) void {
        self.sequence = recovery.latest_cursor;
        self.revision = recovery.snapshot_revision;
        self.state = .replaying;
    }
    pub fn decodeReplayGap(status: u16, body: []const u8) !ReplayGapRecovery {
        if (status != 409) return error.UnexpectedStatus;
        const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
        defer parsed.deinit();
        if (parsed.value != .object) return error.Invalid;
        const root = parsed.value.object;
        const err = root.get("error") orelse return error.Invalid;
        if (err != .object or !std.mem.eql(u8, string(err.object, "code") orelse return error.Invalid, "replay_gap")) return error.Invalid;
        const details = err.object.get("details") orelse return error.Invalid;
        if (details != .object) return error.Invalid;
        return .{ .requested = uintString(details.object, "requested") orelse return error.Invalid, .oldest_available = uintString(details.object, "oldest_available") orelse return error.Invalid, .newest_available = uintString(details.object, "newest_available") orelse return error.Invalid, .latest_cursor = uintString(details.object, "latest_cursor") orelse return error.Invalid, .snapshot_revision = uintString(details.object, "snapshot_revision") orelse return error.Invalid };
    }
    pub fn snapshotRequest(self: *Client, workspace_id: []const u8, path: *[80]u8) !Request {
        if (!uuid(workspace_id)) return error.InvalidIdentity;
        const value = try std.fmt.bufPrint(path, "/v1/workspaces/{s}", .{workspace_id});
        return self.request(.GET, value, "");
    }
    pub fn eventsRequest(self: *Client, cursor_buf: *[20]u8) !Request {
        const cursor = try std.fmt.bufPrint(cursor_buf, "{d}", .{self.sequence});
        // Bound each replay fetch to one event or heartbeat. This preserves SSE
        // ordering while giving the owning application a finite join point on
        // shutdown; the worker reconnects with Last-Event-ID after every frame.
        var req = try self.request(.GET, "/v1/events?finite=1", "");
        req.last_event_id = cursor;
        return req;
    }
    pub fn launchRequestAlloc(self: *Client, allocator: std.mem.Allocator, workspace_id: []const u8, repository_id: []const u8, command_id: ?[]const u8, workspace_revision: u64) !Request {
        if (!uuid(workspace_id) or !uuid(repository_id)) return error.InvalidIdentity;
        if (command_id) |id| if (!prefixed(id, "cmd_")) return error.InvalidIdentity;
        const body = if (command_id) |id| try std.fmt.allocPrint(allocator, "{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\",\"command_id\":\"{s}\",\"expected_revision\":\"{d}\"}}", .{ workspace_id, repository_id, id, workspace_revision }) else try std.fmt.allocPrint(allocator, "{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\",\"expected_revision\":\"{d}\"}}", .{ workspace_id, repository_id, workspace_revision });
        return self.request(.POST, "/v1/native-launch", body);
    }
    pub fn acceptDiscovery(self: *Client, status: u16, body: []const u8) !Outcome {
        if (self.cancelled) return error.Cancelled;
        if (status == 401 or status == 403) {
            self.state = .failed;
            return .{ .failure = "unauthorized" };
        }
        if (status != 200 or !validDiscovery(body)) {
            self.state = .incompatible;
            return .incompatible;
        }
        self.state = .snapshot_loading;
        return .none;
    }
    pub fn acceptSnapshotJson(self: *Client, status: u16, body: []const u8) Outcome {
        if (status != 200) return .{ .failure = "snapshot_transport" };
        const decoded = decodeSnapshot(body) catch {
            self.state = .failed;
            return .{ .failure = "invalid_snapshot" };
        };
        self.revision = decoded.revision;
        self.sequence = decoded.sequence;
        self.state = .replaying;
        return .{ .snapshot = decoded };
    }
    pub fn acceptSnapshot(self: *Client, revision: u64, sequence: u64) Outcome {
        self.revision = revision;
        self.sequence = sequence;
        self.state = .replaying;
        return .{ .snapshot = .{ .revision = revision, .sequence = sequence, .workspace_id = undefined } };
    }
    pub fn acceptEvent(self: *Client, sequence: u64) Outcome {
        return self.order(.{ .sequence = sequence, .kind = .heartbeat });
    }
    fn order(self: *Client, event: Event) Outcome {
        if (event.sequence <= self.sequence) return .duplicate;
        if (event.sequence != self.sequence + 1) {
            self.state = .refresh_required;
            return .gap_refresh;
        }
        self.sequence = event.sequence;
        self.state = .ready;
        self.attempt = 0;
        return .{ .event = event };
    }
    pub fn acceptSse(self: *Client, frame: []const u8) Outcome {
        var id: ?u64 = null;
        var data: ?[]const u8 = null;
        var lines = std.mem.splitScalar(u8, frame, '\n');
        while (lines.next()) |raw| {
            const line = std.mem.trimRight(u8, raw, "\r");
            if (std.mem.startsWith(u8, line, "id:")) id = std.fmt.parseInt(u64, std.mem.trim(u8, line[3..], " "), 10) catch null else if (std.mem.startsWith(u8, line, "data:")) data = std.mem.trim(u8, line[5..], " ");
        }
        const seq = id orelse return .{ .failure = "invalid_sse" };
        const value = data orelse return .{ .failure = "invalid_sse" };
        const event = decodeEvent(seq, value) catch |err| return if (err == error.ReplayGap) blk: {
            self.state = .refresh_required;
            break :blk .gap_refresh;
        } else .{ .failure = "invalid_event" };
        return self.order(event);
    }
    pub fn decodeSseReducerAction(self: *Client, frame: []const u8) !reducer.Action {
        var id: ?u64 = null;
        var data: ?[]const u8 = null;
        var lines = std.mem.splitScalar(u8, frame, '\n');
        while (lines.next()) |raw| {
            const line = std.mem.trimRight(u8, raw, "\r");
            if (std.mem.startsWith(u8, line, "id:")) id = std.fmt.parseInt(u64, std.mem.trim(u8, line[3..], " "), 10) catch null else if (std.mem.startsWith(u8, line, "data:")) data = std.mem.trim(u8, line[5..], " ");
        }
        const sequence = id orelse return error.InvalidSse;
        const payload = data orelse return error.InvalidSse;
        const ordered = self.acceptSse(frame);
        if (ordered == .gap_refresh) return error.ReplayGap;
        if (ordered == .duplicate) return error.Duplicate;
        if (ordered != .event) return error.InvalidSse;
        return decodeReducerEvent(sequence, payload, self.revision);
    }
    pub fn decodeAggregateSnapshot(self: *Client, body: []const u8) !reducer.Action {
        var state = try aggregateState(body);
        state.sequence = self.sequence;
        self.revision = state.revision;
        self.state = .replaying;
        return .{ .snapshot = state };
    }
    pub fn resolveLaunch(self: *Client, status: u16, body: []const u8) !Outcome {
        if (self.cancelled) return error.Cancelled;
        if (status != 200) return .{ .failure = "transport" };
        return .{ .launch = decodeLaunch(body) catch return .{ .failure = "invalid_payload" } };
    }
};

fn exactKeys(object: std.json.ObjectMap, expected: []const []const u8) bool {
    if (object.count() != expected.len) return false;
    for (object.keys()) |k| {
        var found = false;
        for (expected) |e| if (std.mem.eql(u8, k, e)) {
            found = true;
            break;
        };
        if (!found) return false;
    }
    return true;
}
fn string(o: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const v = o.get(key) orelse return null;
    return if (v == .string) v.string else null;
}
fn uintString(o: std.json.ObjectMap, key: []const u8) ?u64 {
    return std.fmt.parseInt(u64, string(o, key) orelse return null, 10) catch null;
}
fn prefixed(v: []const u8, p: []const u8) bool {
    return std.mem.startsWith(u8, v, p) and v.len >= p.len + 16;
}
fn uuid(v: []const u8) bool {
    return v.len == 36 and v[8] == '-' and v[13] == '-' and v[18] == '-' and v[23] == '-';
}
fn validDiscovery(body: []const u8) bool {
    const p = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return false;
    defer p.deinit();
    if (p.value != .object or !exactKeys(p.value.object, &.{ "protocol", "request_id", "ok", "data" })) return false;
    const o = p.value.object;
    if (!std.mem.eql(u8, string(o, "protocol") orelse return false, "v1") or !prefixed(string(o, "request_id") orelse return false, "req_") or o.get("ok").? != .bool or !o.get("ok").?.bool) return false;
    const d = o.get("data").?;
    if (d != .object or !exactKeys(d.object, &.{ "service_version", "capabilities", "limits" }) or (string(d.object, "service_version") orelse "").len == 0) return false;
    const caps = d.object.get("capabilities") orelse return false;
    const limits = d.object.get("limits") orelse return false;
    if (caps != .object or !exactKeys(caps.object, &.{ "workspace_snapshots", "operations", "signals", "native_launch_resolution" }) or limits != .object or !exactKeys(limits.object, &.{ "request_body_bytes", "subscriber_events", "subscriber_bytes", "native_model" })) return false;
    const native = limits.object.get("native_model") orelse return false;
    if (native != .object or !exactKeys(native.object, &.{ "workspaces", "labels_per_workspace", "repositories_per_workspace", "authoritative_pairs", "live_pair_identities", "reserved_orphan_tombstones", "surfaces_per_pair", "commands", "signal_items", "string_bytes" })) return false;
    const expected = [_]struct { []const u8, i64 }{ .{ "workspaces", 16 }, .{ "labels_per_workspace", 16 }, .{ "repositories_per_workspace", 8 }, .{ "authoritative_pairs", 32 }, .{ "live_pair_identities", 32 }, .{ "reserved_orphan_tombstones", 32 }, .{ "surfaces_per_pair", 16 }, .{ "commands", 64 }, .{ "signal_items", 64 } };
    for (expected) |pair| { const value = native.object.get(pair[0]) orelse return false; if (value != .integer or value.integer != pair[1]) return false; }
    const string_bytes = native.object.get("string_bytes") orelse return false;
    return string_bytes == .object;
}
fn decodeSnapshot(body: []const u8) !Snapshot {
    const p = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
    defer p.deinit();
    if (p.value != .object) return error.Invalid;
    const o = p.value.object;
    if (!exactKeys(o, &.{ "protocol", "request_id", "ok", "revision", "generated_at", "workspace" })) return error.Invalid;
    if (!std.mem.eql(u8, string(o, "protocol") orelse return error.Invalid, "v1") or o.get("ok").? != .bool or !o.get("ok").?.bool) return error.Invalid;
    const ws = o.get("workspace") orelse return error.Invalid;
    if (ws != .object) return error.Invalid;
    const id = string(ws.object, "id") orelse return error.Invalid;
    if (!uuid(id)) return error.Invalid;
    var result = Snapshot{ .revision = uintString(o, "revision") orelse return error.Invalid, .sequence = 0, .workspace_id = undefined };
    @memcpy(&result.workspace_id, id);
    return result;
}
fn decodeEvent(sse_id: u64, body: []const u8) !Event {
    const p = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
    defer p.deinit();
    if (p.value != .object) return error.Invalid;
    const o = p.value.object;
    const seq = uintString(o, "sequence") orelse return error.Invalid;
    if (seq != sse_id or !std.mem.eql(u8, string(o, "protocol") orelse return error.Invalid, "v1")) return error.Invalid;
    const typ = string(o, "type") orelse return error.Invalid;
    if (std.mem.eql(u8, typ, "signal")) {
        if (o.get("signal") == null) return error.Invalid;
        return .{ .sequence = seq, .kind = .signal };
    }
    if (std.mem.eql(u8, typ, "operation")) {
        if (o.get("operation") == null) return error.Invalid;
        return .{ .sequence = seq, .kind = .operation };
    }
    if (std.mem.eql(u8, typ, "control")) {
        const c = o.get("control") orelse return error.Invalid;
        if (c != .object) return error.Invalid;
        const k = string(c.object, "kind") orelse return error.Invalid;
        if (std.mem.eql(u8, k, "replay_gap")) return error.ReplayGap;
        if (!std.mem.eql(u8, k, "heartbeat")) return error.Invalid;
        return .{ .sequence = seq, .kind = .heartbeat };
    }
    return error.Invalid;
}
fn decodeLaunch(body: []const u8) !Launch {
    const p = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
    defer p.deinit();
    if (p.value != .object) return error.Invalid;
    const root = p.value.object;
    const wrapped = root.get("data");
    const o = if (wrapped) |v| blk: {
        if (!exactKeys(root, &.{ "protocol", "request_id", "ok", "data" }) or v != .object) return error.Invalid;
        break :blk v.object;
    } else root;
    const resolved = o.get("resolved") orelse return error.Invalid;
    if (resolved != .bool or !resolved.bool) return error.ResolutionFailed;
    if (!exactKeys(o, &.{ "resolved", "revision", "launch" })) return error.Invalid;
    const l = o.get("launch").?;
    if (l != .object or !exactKeys(l.object, &.{ "argv", "cwd", "environment", "ports", "configuration", "redacted" })) return error.Invalid;
    const av = l.object.get("argv").?;
    const cwd = string(l.object, "cwd") orelse return error.Invalid;
    if (av != .array or av.array.items.len == 0 or av.array.items.len > 32 or cwd.len == 0 or cwd.len > 512) return error.Invalid;
    var out: Launch = .{ .revision = uintString(o, "revision") orelse return error.Invalid, .cwd_len = @intCast(cwd.len) };
    @memcpy(out.cwd[0..cwd.len], cwd);
    for (av.array.items, 0..) |v, i| {
        if (v != .string or v.string.len == 0 or v.string.len > 256) return error.Invalid;
        @memcpy(out.argv[i][0..v.string.len], v.string);
        out.argv_lens[i] = @intCast(v.string.len);
    }
    out.argv_count = @intCast(av.array.items.len);
    const env = l.object.get("environment").?;
    const ports = l.object.get("ports").?;
    const red = l.object.get("redacted").?;
    const cfg = l.object.get("configuration").?;
    if (env != .object or env.object.count() > 64 or ports != .object or ports.object.count() > 32 or red != .array or cfg != .object or !exactKeys(cfg.object, &.{"shell"}) and !exactKeys(cfg.object, &.{ "command_id", "shell" })) return error.Invalid;
    for (env.object.keys(), 0..) |key, i| {
        const value = env.object.get(key).?;
        if (key.len == 0 or key.len > 128 or value != .string or value.string.len > 4096) return error.Invalid;
        @memcpy(out.environment_keys[i][0..key.len], key);
        out.environment_key_lens[i] = @intCast(key.len);
        @memcpy(out.environment_values[i][0..value.string.len], value.string);
        out.environment_value_lens[i] = @intCast(value.string.len);
    }
    out.environment_count = @intCast(env.object.count());
    for (ports.object.keys(), 0..) |key, i| {
        const value = ports.object.get(key).?;
        if (key.len == 0 or key.len > 128 or value != .integer or value.integer < 1 or value.integer > 65535) return error.Invalid;
        @memcpy(out.port_keys[i][0..key.len], key);
        out.port_key_lens[i] = @intCast(key.len);
        out.port_values[i] = @intCast(value.integer);
    }
    out.port_count = @intCast(ports.object.count());
    const shell = cfg.object.get("shell").?;
    if (shell != .bool) return error.Invalid;
    out.shell = shell.bool;
    if (cfg.object.get("command_id")) |cid| {
        if (cid != .string or !prefixed(cid.string, "cmd_") or cid.string.len > 64) return error.Invalid;
        @memcpy(out.command_id[0..cid.string.len], cid.string);
        out.command_id_len = @intCast(cid.string.len);
    }
    out.redacted_count = @intCast(red.array.items.len);
    return out;
}

fn aggregateState(body: []const u8) !model.State {
    const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.Invalid;
    const root = parsed.value.object;
    if (!exactKeys(root, &.{ "protocol", "request_id", "ok", "data" }) or !std.mem.eql(u8, string(root, "protocol") orelse return error.Invalid, "v1")) return error.Invalid;
    const data = root.get("data") orelse return error.Invalid;
    if (data != .array or data.array.items.len > 16) return error.Capacity;
    var state: model.State = .{ .connection = .ready, .has_snapshot = true };
    for (data.array.items, 0..) |entry, wi| {
        if (entry != .object) return error.Invalid;
        const eo = entry.object;
        const workspace_revision = uintString(eo, "revision") orelse return error.Invalid;
        state.revision = @max(state.revision, workspace_revision);
        const workspace = eo.get("workspace") orelse return error.Invalid;
        if (workspace != .object) return error.Invalid;
        const wo = workspace.object;
        const wid = string(wo, "id") orelse return error.Invalid;
        const wname = string(wo, "name") orelse return error.Invalid;
        if (!uuid(wid) or wname.len == 0 or wname.len > 96) return error.Invalid;
        var ws: model.Workspace = .{ .id = undefined, .revision = workspace_revision };
        @memcpy(&ws.id, wid);
        @memcpy(ws.name[0..wname.len], wname);
        ws.name_len = @intCast(wname.len);
        if (wo.get("labels")) |labels| {
            if (labels != .array or labels.array.items.len > 16) return error.Capacity;
            for (labels.array.items, 0..) |label, li| {
                if (label != .string or label.string.len == 0 or label.string.len > 64) return error.Invalid;
                @memcpy(ws.labels[li][0..label.string.len], label.string);
                ws.label_lens[li] = @intCast(label.string.len);
                ws.label_count += 1;
            }
        }
        const repos = wo.get("repositories") orelse return error.Invalid;
        if (repos != .array or repos.array.items.len > 8) return error.Capacity;
        for (repos.array.items, 0..) |repo, ri| {
            if (repo != .object) return error.Invalid;
            const rid = string(repo.object, "id") orelse return error.Invalid;
            const rname = string(repo.object, "name") orelse return error.Invalid;
            if (!uuid(rid) or rname.len == 0 or rname.len > 96) return error.Invalid;
            @memcpy(&ws.repository_ids[ri], rid);
            ws.repositories[ri].id = ws.repository_ids[ri];
            @memcpy(ws.repositories[ri].name[0..rname.len], rname);
            ws.repositories[ri].name_len = @intCast(rname.len);
            ws.repository_count += 1;
            state.pairs[state.pair_count] = .{ .key = .{ .workspace_id = ws.id, .repository_id = ws.repository_ids[ri] }, .surfaces = undefined };
            state.pair_count += 1;
        }
        if (wo.get("status")) |statuses| {
            if (statuses != .array or statuses.array.items.len > repos.array.items.len) return error.Capacity;
            for (statuses.array.items) |status| {
                if (status != .object) return error.Invalid;
                const so = status.object;
                const rid = string(so, "repository_id") orelse return error.Invalid;
                const branch = string(so, "branch") orelse return error.Invalid;
                const default_branch = string(so, "default_branch") orelse return error.Invalid;
                if (!uuid(rid) or branch.len > 96 or default_branch.len == 0 or default_branch.len > 96) return error.Invalid;
                var ri: ?usize = null;
                for (ws.repository_ids[0..ws.repository_count], 0..) |candidate, index| if (std.mem.eql(u8, &candidate, rid)) { ri = index; break; };
                const index = ri orelse return error.Invalid;
                var p: model.RepositoryPresentation = .{};
                @memcpy(p.branch[0..branch.len], branch); p.branch_len = @intCast(branch.len);
                @memcpy(p.default_branch[0..default_branch.len], default_branch); p.default_branch_len = @intCast(default_branch.len);
                const exists = so.get("exists") orelse return error.Invalid; const dirty = so.get("dirty") orelse return error.Invalid;
                const degraded = so.get("degraded") orelse return error.Invalid;
                if (exists != .bool or dirty != .bool or degraded != .bool) return error.Invalid;
                p.exists = exists.bool; p.dirty = dirty.bool; p.degraded = degraded.bool;
                inline for (.{ "ahead", "behind", "additions", "removals" }) |field| {
                    const value = so.get(field) orelse return error.Invalid;
                    if (value != .integer or value.integer < 0) return error.Invalid;
                    if (std.mem.eql(u8, field, "ahead")) p.ahead = std.math.cast(u32, value.integer) orelse return error.Capacity
                    else if (std.mem.eql(u8, field, "behind")) p.behind = std.math.cast(u32, value.integer) orelse return error.Capacity
                    else if (std.mem.eql(u8, field, "additions")) p.additions = @intCast(value.integer)
                    else p.removals = @intCast(value.integer);
                }
                const remote = string(so, "remote") orelse return error.Invalid;
                p.remote = if (std.mem.eql(u8, remote, "available")) .available else if (std.mem.eql(u8, remote, "missing")) .missing else if (std.mem.eql(u8, remote, "not_applicable")) .not_applicable else return error.Invalid;
                if (so.get("pull_request")) |pr| {
                    if (pr != .object) return error.Invalid;
                    const number = pr.object.get("number") orelse return error.Invalid; const state_name = string(pr.object, "state") orelse return error.Invalid;
                    if (number != .integer or number.integer <= 0) return error.Invalid;
                    var value: model.PullRequestPresentation = .{ .number = std.math.cast(u32, number.integer) orelse return error.Capacity, .state = if (std.mem.eql(u8, state_name, "open")) .open else if (std.mem.eql(u8, state_name, "draft")) .draft else if (std.mem.eql(u8, state_name, "merged")) .merged else if (std.mem.eql(u8, state_name, "closed")) .closed else return error.Invalid };
                    if (string(pr.object, "checks")) |checks| value.checks = if (std.mem.eql(u8, checks, "pending")) .pending else if (std.mem.eql(u8, checks, "passing")) .passing else if (std.mem.eql(u8, checks, "failing")) .failing else return error.Invalid;
                    p.pull_request = value;
                }
                ws.repositories[index].presentation = p;
            }
        }
        if (wo.get("launch")) |launch| if (launch == .object) if (launch.object.get("named")) |named| if (named == .array) for (named.array.items) |value| {
            if (value != .object or state.command_count >= state.commands.len) return error.Invalid;
            const cid = string(value.object, "id") orelse return error.Invalid;
            const name = string(value.object, "name") orelse return error.Invalid;
            if (!prefixed(cid, "cmd_") or cid.len > 64 or name.len == 0 or name.len > 96) return error.Invalid;
            var command: model.Command = .{ .workspace_id = ws.id };
            @memcpy(command.id[0..cid.len], cid);
            command.id_len = @intCast(cid.len);
            @memcpy(command.name[0..name.len], name);
            command.name_len = @intCast(name.len);
            if (value.object.get("repository_id")) |r| {
                if (r != .string or !uuid(r.string)) return error.Invalid;
                var rid: model.Id = undefined;
                @memcpy(&rid, r.string);
                command.repository_id = rid;
            }
            state.commands[state.command_count] = command;
            state.command_count += 1;
        };
        state.workspaces[wi] = ws;
        state.workspace_count += 1;
    }
    return state;
}

fn signalKey(source: []const u8) model.Id {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(source, &digest, .{});
    const hex = std.fmt.bytesToHex(digest[0..16], .lower);
    var out: model.Id = undefined;
    @memcpy(out[0..8], hex[0..8]);
    out[8] = '-';
    @memcpy(out[9..13], hex[8..12]);
    out[13] = '-';
    @memcpy(out[14..18], hex[12..16]);
    out[18] = '-';
    @memcpy(out[19..23], hex[16..20]);
    out[23] = '-';
    @memcpy(out[24..36], hex[20..32]);
    return out;
}
fn decodeReducerEvent(sequence: u64, body: []const u8, revision: u64) !reducer.Action {
    const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.Invalid;
    const root = parsed.value.object;
    const typ = string(root, "type") orelse return error.Invalid;
    if (!std.mem.eql(u8, typ, "signal")) return .{ .event = .{ .revision = revision, .sequence = sequence } };
    const value = root.get("signal") orelse return error.Invalid;
    if (value != .object) return error.Invalid;
    const a = value.object;
    if (std.mem.eql(u8, string(a, "kind") orelse "", "dismiss_signal")) {
        const dismissed = string(a, "signal_id") orelse return error.Invalid;
        if (!prefixed(dismissed, "sig_") or dismissed.len > 64) return error.Invalid;
        var action: reducer.Action = .{ .signal_dismissed = .{ .signal_id = [_]u8{0} ** 64, .signal_id_len = @intCast(dismissed.len) } };
        @memcpy(action.signal_dismissed.signal_id[0..dismissed.len], dismissed);
        return action;
    }
    const aid = string(a, "id") orelse return error.Invalid;
    if (!prefixed(aid, "sig_") or aid.len > 64) return error.Invalid;
    const wid = string(a, "workspace_id") orelse return error.Invalid;
    if (!uuid(wid)) return error.Invalid;
    const status = string(a, "state") orelse if (std.mem.eql(u8, string(a, "kind") orelse "", "notification")) "waiting" else return error.Invalid;
    const source = string(a, "source") orelse return error.Invalid;
    const title = string(a, "title") orelse return error.Invalid;
    const occurred = string(a, "occurred_at") orelse return error.Invalid;
    const journal = uintString(a, "journal_sequence") orelse sequence;
    if (journal != sequence or title.len == 0 or title.len > 160 or !std.unicode.utf8ValidateSlice(title) or occurred.len < 20 or occurred.len > 40 or !std.unicode.utf8ValidateSlice(occurred) or !(std.mem.eql(u8, source, "claude") or std.mem.eql(u8, source, "copilot") or std.mem.eql(u8, source, "codex") or std.mem.eql(u8, source, "opencode") or std.mem.eql(u8, source, "automation") or std.mem.eql(u8, source, "acp") or std.mem.eql(u8, source, "user") or std.mem.eql(u8, source, "other"))) return error.Invalid;
    const signal_kind = string(a, "kind") orelse return error.Invalid;
    var item: model.Signal = .{ .id = signalKey(aid), .workspace_id = undefined, .kind = if (std.mem.eql(u8, signal_kind, "notification")) .notification else if (std.mem.eql(u8, signal_kind, "activity")) .activity else return error.Invalid, .status = if (std.mem.eql(u8, status, "failed")) .failed else if (std.mem.eql(u8, status, "waiting")) .waiting else if (std.mem.eql(u8, status, "completed")) .completed else if (std.mem.eql(u8, status, "working")) .working else if (std.mem.eql(u8, status, "idle")) .idle else return error.Invalid };
    item.provider = if (std.mem.eql(u8, source, "claude")) .claude else if (std.mem.eql(u8, source, "copilot")) .copilot else if (std.mem.eql(u8, source, "codex")) .codex else if (std.mem.eql(u8, source, "opencode")) .opencode else if (std.mem.eql(u8, source, "automation")) .automation else if (std.mem.eql(u8, source, "acp")) .acp else if (std.mem.eql(u8, source, "user")) .user else .other;
    @memcpy(item.signal_id[0..aid.len], aid);
    item.signal_id_len = @intCast(aid.len);
    @memcpy(item.title[0..title.len], title);
    item.title_len = @intCast(title.len);
    if (a.get("detail")) |detail| {
        if (detail != .string or detail.string.len > 500 or !std.unicode.utf8ValidateSlice(detail.string)) return error.Invalid;
        @memcpy(item.detail[0..detail.string.len], detail.string);
        item.detail_len = @intCast(detail.string.len);
    }
    @memcpy(item.occurred_at[0..occurred.len], occurred);
    item.occurred_at_len = @intCast(occurred.len);
    @memcpy(&item.workspace_id, wid);
    if (a.get("repository_id")) |r| {
        if (r != .string or !uuid(r.string)) return error.Invalid;
        var rid: model.Id = undefined;
        @memcpy(&rid, r.string);
        item.repository_id = rid;
    }
    if (a.get("surface_id")) |s| {
        if (s != .string or !uuid(s.string) or item.repository_id == null) return error.Invalid;
        var sid: model.Id = undefined;
        @memcpy(&sid, s.string);
        item.surface_id = sid;
    }
    return .{ .signal_received = item };
}

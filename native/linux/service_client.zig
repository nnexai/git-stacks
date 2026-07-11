const std = @import("std");
pub const Connection = enum { disconnected, discovering, snapshot_loading, replaying, ready, refresh_required, incompatible, failed, shutting_down };
pub const Outcome = union(enum) { none, snapshot: struct { revision: u64, sequence: u64 }, event: u64, duplicate, gap_refresh, incompatible, failure: []const u8, launch: Launch };
pub const Launch = struct {
    argv_count: usize,
    cwd: [256]u8 = [_]u8{0} ** 256,
    cwd_len: u16 = 0,
    pub fn cwdSlice(self: *const Launch) []const u8 {
        return self.cwd[0..self.cwd_len];
    }
};
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
    pub fn acceptDiscovery(self: *Client, status: u16, body: []const u8) !Outcome {
        if (self.cancelled) return error.Cancelled;
        if (status == 401 or status == 403) {
            self.state = .failed;
            return .{ .failure = "unauthorized" };
        }
        const p = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch {
            self.state = .incompatible;
            return .incompatible;
        };
        defer p.deinit();
        if (p.value != .object or p.value.object.get("protocol") == null or p.value.object.get("protocol").? != .string or !std.mem.eql(u8, p.value.object.get("protocol").?.string, "v1")) {
            self.state = .incompatible;
            return .incompatible;
        }
        self.state = .snapshot_loading;
        return .none;
    }
    pub fn acceptSnapshot(self: *Client, revision: u64, sequence: u64) Outcome {
        self.revision = revision;
        self.sequence = sequence;
        self.state = .replaying;
        return .{ .snapshot = .{ .revision = revision, .sequence = sequence } };
    }
    pub fn acceptEvent(self: *Client, sequence: u64) Outcome {
        if (sequence <= self.sequence) return .duplicate;
        if (sequence != self.sequence + 1) {
            self.state = .refresh_required;
            return .gap_refresh;
        }
        self.sequence = sequence;
        self.state = .ready;
        self.attempt = 0;
        return .{ .event = sequence };
    }
    pub fn resolveLaunch(self: *Client, status: u16, body: []const u8) !Outcome {
        if (self.cancelled) return error.Cancelled;
        if (status != 200) return .{ .failure = "transport" };
        const p = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return .{ .failure = "invalid_payload" };
        defer p.deinit();
        if (p.value != .object) return .{ .failure = "invalid_payload" };
        const resolved = p.value.object.get("resolved") orelse return .{ .failure = "invalid_payload" };
        if (resolved != .bool or !resolved.bool) return .{ .failure = "resolution_failed" };
        const launch = p.value.object.get("launch") orelse return .{ .failure = "invalid_payload" };
        if (launch != .object) return .{ .failure = "invalid_payload" };
        const argv = launch.object.get("argv") orelse return .{ .failure = "invalid_payload" };
        const cwd = launch.object.get("cwd") orelse return .{ .failure = "invalid_payload" };
        if (argv != .array or argv.array.items.len == 0 or cwd != .string or cwd.string.len > 256) return .{ .failure = "invalid_payload" };
        var result: Launch = .{ .argv_count = argv.array.items.len, .cwd_len = @intCast(cwd.string.len) };
        @memcpy(result.cwd[0..cwd.string.len], cwd.string);
        return .{ .launch = result };
    }
};

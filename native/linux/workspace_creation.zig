const std = @import("std");

pub const SourceKind = enum { template, repositories };
pub const OperationState = enum { idle, submitting, accepted, running, succeeded, failed, cancelled };
pub const Submission = struct {
    body: []u8,
    idempotency_key: [64]u8,
    idempotency_key_len: u8,
    pub fn deinit(self: Submission, allocator: std.mem.Allocator) void { allocator.free(self.body); }
    pub fn key(self: *const Submission) []const u8 { return self.idempotency_key[0..self.idempotency_key_len]; }
};
pub const Controller = struct {
    name: [96]u8 = [_]u8{0} ** 96, name_len: u8 = 0,
    branch: [96]u8 = [_]u8{0} ** 96, branch_len: u8 = 0,
    source_kind: SourceKind = .template,
    template: [96]u8 = [_]u8{0} ** 96, template_len: u8 = 0,
    repositories: [8][96]u8 = [_][96]u8{[_]u8{0} ** 96} ** 8,
    repository_lens: [8]u8 = [_]u8{0} ** 8, repository_count: u8 = 0,
    connected: bool = false, catalog_loaded: bool = false, compatible: bool = true, branch_edited: bool = false,
    state: OperationState = .idle,
    operation_id: [64]u8 = [_]u8{0} ** 64, operation_id_len: u8 = 0,
    completed: u32 = 0, total: u32 = 0,
    pub fn setName(self: *Controller, value: []const u8) !void { try set(&self.name, &self.name_len, value); }
    pub fn setBranch(self: *Controller, value: []const u8) !void { try set(&self.branch, &self.branch_len, value); self.branch_edited = true; }
    pub fn selectTemplate(self: *Controller, value: []const u8, branch_hint: ?[]const u8) !void { self.source_kind = .template; try set(&self.template, &self.template_len, value); if (!self.branch_edited) if (branch_hint) |hint| try set(&self.branch, &self.branch_len, hint); }
    pub fn toggleRepository(self: *Controller, value: []const u8) !void {
        for (0..self.repository_count) |i| if (std.mem.eql(u8, self.repositories[i][0..self.repository_lens[i]], value)) { for (i..self.repository_count - 1) |j| { self.repositories[j] = self.repositories[j + 1]; self.repository_lens[j] = self.repository_lens[j + 1]; } self.repository_count -= 1; return; };
        if (self.repository_count == 8) return error.Capacity;
        var len: u8 = 0; try set(&self.repositories[self.repository_count], &len, value); self.repository_lens[self.repository_count] = len; self.repository_count += 1;
    }
    pub fn ready(self: *const Controller) bool { return self.connected and self.catalog_loaded and self.compatible and self.name_len > 0 and self.branch_len > 0 and (if (self.source_kind == .template) self.template_len > 0 else self.repository_count > 0) and (self.state == .idle or self.state == .failed or self.state == .cancelled); }
    pub fn beginSubmission(self: *Controller, allocator: std.mem.Allocator, random: *const fn ([]u8) anyerror!void) !Submission {
        if (!self.ready()) return error.NotReady;
        var key: [64]u8 = [_]u8{0} ** 64; @memcpy(key[0..5], "idem_"); try random(key[5..37]);
        for (key[5..37]) |*byte| byte.* = "0123456789abcdef"[byte.* & 15];
        var out: std.Io.Writer.Allocating = .init(allocator); errdefer out.deinit();
        try out.writer.writeAll("{\"name\":"); try std.json.Stringify.encodeJsonString(self.name[0..self.name_len], .{}, &out.writer); try out.writer.writeAll(",\"branch\":"); try std.json.Stringify.encodeJsonString(self.branch[0..self.branch_len], .{}, &out.writer);
        if (self.source_kind == .template) { try out.writer.writeAll(",\"source\":{\"kind\":\"template\",\"template\":"); try std.json.Stringify.encodeJsonString(self.template[0..self.template_len], .{}, &out.writer); try out.writer.writeAll("}}"); } else { try out.writer.writeAll(",\"source\":{\"kind\":\"repositories\",\"repositories\":["); for (0..self.repository_count) |i| { if (i > 0) try out.writer.writeByte(','); try std.json.Stringify.encodeJsonString(self.repositories[i][0..self.repository_lens[i]], .{}, &out.writer); } try out.writer.writeAll("]}}"); }
        self.state = .submitting;
        return .{ .body = try out.toOwnedSlice(), .idempotency_key = key, .idempotency_key_len = 37 };
    }
    pub fn bindOperation(self: *Controller, id: []const u8) !void { try set(&self.operation_id, &self.operation_id_len, id); self.state = .accepted; }
    pub fn progress(self: *Controller, completed: u32, total: u32) !void { if (total == 0 or completed > total) return error.InvalidProgress; self.completed = completed; self.total = total; self.state = .running; }
    pub fn finish(self: *Controller, state: OperationState) !void { if (state != .succeeded and state != .failed and state != .cancelled) return error.InvalidState; self.state = state; }
};
fn set(buffer: anytype, length: *u8, value: []const u8) !void { if (value.len == 0 or value.len > buffer.len or !std.unicode.utf8ValidateSlice(value)) return error.InvalidValue; @memcpy(buffer[0..value.len], value); length.* = @intCast(value.len); }

/// Parses a response string into caller-owned storage. Never return a slice
/// backed by std.json's temporary arena: creation polling outlives that arena.
pub fn copyJsonStringField(body: []const u8, key: []const u8, output: []u8) ?[]const u8 {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return null;
    defer parsed.deinit();
    if (parsed.value != .object) return null;
    const root = if (parsed.value.object.get("data")) |data| if (data == .object) data.object else parsed.value.object else parsed.value.object;
    const value = root.get(key) orelse return null;
    if (value != .string or value.string.len == 0 or value.string.len > output.len) return null;
    @memcpy(output[0..value.string.len], value.string);
    return output[0..value.string.len];
}

const std = @import("std");
const identity = @import("identity.zig");
const model = @import("model.zig");

pub const Record = struct {
    surface_id: [36]u8,
    workspace_id: ?[36]u8 = null,
    repository_id: ?[36]u8 = null,
    title: []const u8 = "",
    order: u32 = 0,
    cwd_label: []const u8 = "",
    last_exit_status: ?i32 = null,
    predecessor_surface_id: ?[36]u8 = null,
    lifecycle: model.Lifecycle = .ended,
};

pub const Diagnostic = struct { index: usize, hash: [16]u8, code: []const u8 };
pub const RestoreResult = struct {
    records: std.ArrayList(Record),
    diagnostics: std.ArrayList(Diagnostic),
    arena: std.heap.ArenaAllocator,
    pub fn deinit(self: *RestoreResult) void { self.records.deinit(self.arena.allocator()); self.diagnostics.deinit(self.arena.allocator()); self.arena.deinit(); }
};

fn shortHash(bytes: []const u8) [16]u8 {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    return std.fmt.bytesToHex(digest[0..8], .lower);
}

pub fn encodeAlloc(allocator: std.mem.Allocator, records: []const Record) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.appendSlice(allocator, "{\"protocol\":\"v1\",\"entries\":[");
    for (records, 0..) |record, index| {
        if (index != 0) try out.append(allocator, ',');
        if (!identity.isUuid(&record.surface_id) or record.lifecycle != .ended) return error.InvalidRecord;
        var status_buffer: [16]u8 = undefined;
        const status_text = if (record.last_exit_status) |status| try std.fmt.bufPrint(&status_buffer, "{d}", .{status}) else "null";
        const item = try std.fmt.allocPrint(allocator, "{{\"surface_id\":\"{s}\",\"title\":\"{s}\",\"order\":{d},\"cwd_label\":\"{s}\",\"last_exit_status\":{s},\"lifecycle\":\"ended\"}}", .{
            record.surface_id, record.title, record.order, record.cwd_label,
            status_text,
        });
        defer allocator.free(item);
        try out.appendSlice(allocator, item);
    }
    try out.appendSlice(allocator, "]}");
    return out.toOwnedSlice(allocator);
}

pub fn restore(allocator: std.mem.Allocator, bytes: []const u8) !RestoreResult {
    var result = RestoreResult{ .records = .empty, .diagnostics = .empty, .arena = std.heap.ArenaAllocator.init(allocator) };
    errdefer result.deinit();
    const a = result.arena.allocator();
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    const root = parsed.value.object;
    const protocol = root.get("protocol") orelse return error.InvalidDocument;
    if (protocol != .string or !std.mem.eql(u8, protocol.string, "v1")) return error.InvalidDocument;
    const entries = root.get("entries") orelse return error.InvalidDocument;
    if (entries != .array) return error.InvalidDocument;
    for (entries.array.items, 0..) |entry, index| {
        const rendered = try std.fmt.allocPrint(a, "{any}", .{entry});
        const object = if (entry == .object) entry.object else {
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_entry" }); continue;
        };
        const sid = object.get("surface_id") orelse {
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "missing_identity" }); continue;
        };
        if (sid != .string or !identity.isUuid(sid.string)) {
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_identity" }); continue;
        }
        var id: [36]u8 = undefined; @memcpy(&id, sid.string);
        const title_value = object.get("title");
        const title = if (title_value != null and title_value.? == .string) title_value.?.string else "";
        const cwd_value = object.get("cwd_label");
        const cwd = if (cwd_value != null and cwd_value.? == .string) cwd_value.?.string else "";
        try result.records.append(a, .{ .surface_id = id, .title = title, .cwd_label = cwd, .lifecycle = .ended });
    }
    return result;
}

pub fn isSafeMode(mode: u32, directory: bool) bool { return (mode & 0o077) == 0 and (mode & if (directory) @as(u32, 0o700) else @as(u32, 0o600)) != 0; }

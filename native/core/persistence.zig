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
pub const Presentation = struct {
    organization_mode: model.OrganizationMode = .simple,
    pinned_workspace_ids: []const [36]u8 = &.{},
    last_pair: ?model.PairKey = null,
    records: []const Record = &.{},
};

pub const Diagnostic = struct { index: usize, hash: [16]u8, code: []const u8 };
pub const RestoreResult = struct {
    records: std.ArrayList(Record),
    diagnostics: std.ArrayList(Diagnostic),
    arena: std.heap.ArenaAllocator,
    pub fn deinit(self: *RestoreResult) void {
        self.records.deinit(self.arena.allocator());
        self.diagnostics.deinit(self.arena.allocator());
        self.arena.deinit();
    }
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
        try out.writer(allocator).print("{{\"surface_id\":\"{s}\",", .{record.surface_id});
        try out.appendSlice(allocator, "\"workspace_id\":");
        if (record.workspace_id) |v| try out.writer(allocator).print("\"{s}\"", .{v}) else try out.appendSlice(allocator, "null");
        try out.appendSlice(allocator, ",\"repository_id\":");
        if (record.repository_id) |v| try out.writer(allocator).print("\"{s}\"", .{v}) else try out.appendSlice(allocator, "null");
        try out.writer(allocator).print(",\"title\":{f}", .{std.json.fmt(record.title, .{})});
        try out.writer(allocator).print(",\"order\":{d},\"cwd_label\":{f}", .{ record.order, std.json.fmt(record.cwd_label, .{}) });
        try out.writer(allocator).print(",\"last_exit_status\":{s},", .{status_text});
        try out.appendSlice(allocator, "\"predecessor_surface_id\":");
        if (record.predecessor_surface_id) |v| try out.writer(allocator).print("\"{s}\"", .{v}) else try out.appendSlice(allocator, "null");
        try out.appendSlice(allocator, ",\"lifecycle\":\"ended\"}");
    }
    try out.appendSlice(allocator, "]}");
    return out.toOwnedSlice(allocator);
}

pub fn encodePresentationAlloc(allocator: std.mem.Allocator, presentation: Presentation) ![]u8 {
    for (presentation.pinned_workspace_ids) |id| if (!identity.isUuid(&id)) return error.InvalidRecord;
    if (presentation.last_pair) |pair| if (!identity.isUuid(&pair.workspace_id) or !identity.isUuid(&pair.repository_id)) return error.InvalidRecord;
    const entries = try encodeAlloc(allocator, presentation.records);
    defer allocator.free(entries);
    const start = std.mem.indexOf(u8, entries, "\"entries\":") orelse return error.InvalidRecord;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.writer(allocator).print("{{\"protocol\":\"v1\",\"organization_mode\":\"{s}\",\"pinned_workspace_ids\":[", .{@tagName(presentation.organization_mode)});
    for (presentation.pinned_workspace_ids, 0..) |pin, i| { if (i != 0) try out.append(allocator, ','); try out.writer(allocator).print("\"{s}\"", .{pin}); }
    try out.appendSlice(allocator, "],\"last_pair\":");
    if (presentation.last_pair) |pair| try out.writer(allocator).print("{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\"}}", .{pair.workspace_id,pair.repository_id}) else try out.appendSlice(allocator,"null");
    try out.append(allocator, ',');
    try out.appendSlice(allocator, entries[start..]);
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
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_entry" });
            continue;
        };
        const sid = object.get("surface_id") orelse {
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "missing_identity" });
            continue;
        };
        if (sid != .string or !identity.isUuid(sid.string)) {
            try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_identity" });
            continue;
        }
        var id: [36]u8 = undefined;
        @memcpy(&id, sid.string);
        const title_value = object.get("title");
        const title = if (title_value != null and title_value.? == .string) title_value.?.string else "";
        const cwd_value = object.get("cwd_label");
        const cwd = if (cwd_value != null and cwd_value.? == .string) cwd_value.?.string else "";
        const order_value = object.get("order");
        const order: u32 = if (order_value != null and order_value.? == .integer and order_value.?.integer >= 0 and order_value.?.integer <= std.math.maxInt(u32)) @intCast(order_value.?.integer) else 0;
        var ws: ?model.Id = null;
        if (object.get("workspace_id")) |v| if (v == .string and identity.isUuid(v.string)) {
            var x: model.Id = undefined;
            @memcpy(&x, v.string);
            ws = x;
        };
        var repo: ?model.Id = null;
        if (object.get("repository_id")) |v| if (v == .string and identity.isUuid(v.string)) {
            var x: model.Id = undefined;
            @memcpy(&x, v.string);
            repo = x;
        };
        var predecessor: ?model.Id = null;
        if (object.get("predecessor_surface_id")) |v| if (v == .string and identity.isUuid(v.string)) {
            var x: model.Id = undefined;
            @memcpy(&x, v.string);
            predecessor = x;
        };
        const exit_value = object.get("last_exit_status");
        const exit: ?i32 = if (exit_value != null and exit_value.? == .integer and exit_value.?.integer >= std.math.minInt(i32) and exit_value.?.integer <= std.math.maxInt(i32)) @intCast(exit_value.?.integer) else null;
        try result.records.append(a, .{ .surface_id = id, .workspace_id = ws, .repository_id = repo, .title = title, .order = order, .cwd_label = cwd, .last_exit_status = exit, .predecessor_surface_id = predecessor, .lifecycle = .ended });
    }
    return result;
}

pub fn isSafeMode(mode: u32, directory: bool) bool {
    return (mode & 0o077) == 0 and (mode & if (directory) @as(u32, 0o700) else @as(u32, 0o600)) != 0;
}

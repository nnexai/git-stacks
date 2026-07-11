const std = @import("std");
const identity = @import("identity.zig");
const model = @import("model");
pub const State = model.State;
pub const Lifecycle = model.Lifecycle;

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
    organization_mode: model.OrganizationMode = .simple,
    pinned_workspace_ids: std.ArrayList(model.Id),
    last_pair: ?model.PairKey = null,
    records: std.ArrayList(Record),
    diagnostics: std.ArrayList(Diagnostic),
    arena: std.heap.ArenaAllocator,
    pub fn deinit(self: *RestoreResult) void {
        self.records.deinit(self.arena.allocator());
        self.pinned_workspace_ids.deinit(self.arena.allocator());
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
    var result = RestoreResult{ .records = .empty, .diagnostics = .empty, .pinned_workspace_ids = .empty, .arena = std.heap.ArenaAllocator.init(allocator) };
    errdefer result.deinit();
    const a = result.arena.allocator();
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    const root = parsed.value.object;
    const protocol = root.get("protocol") orelse return error.InvalidDocument;
    if (protocol != .string or !std.mem.eql(u8, protocol.string, "v1")) return error.InvalidDocument;
    if (root.get("organization_mode")) |mode| {
        if (mode != .string) return error.InvalidDocument;
        result.organization_mode = if (std.mem.eql(u8, mode.string, "simple")) .simple else if (std.mem.eql(u8, mode.string, "label")) .label else if (std.mem.eql(u8, mode.string, "repository")) .repository else return error.InvalidDocument;
    }
    if (root.get("pinned_workspace_ids") orelse root.get("pins")) |pins| {
        if (pins != .array) return error.InvalidDocument;
        for (pins.array.items) |pin| {
            if (pin != .string or !identity.isUuid(pin.string)) continue;
            var id: model.Id = undefined; @memcpy(&id, pin.string); try result.pinned_workspace_ids.append(a, id);
        }
    }
    if (root.get("last_pair")) |pair| if (pair != .null) {
        if (pair != .object) return error.InvalidDocument;
        const w = pair.object.get("workspace_id") orelse return error.InvalidDocument;
        const r = pair.object.get("repository_id") orelse return error.InvalidDocument;
        if (w != .string or r != .string or !identity.isUuid(w.string) or !identity.isUuid(r.string)) return error.InvalidDocument;
        var key: model.PairKey = undefined; @memcpy(&key.workspace_id, w.string); @memcpy(&key.repository_id, r.string); result.last_pair = key;
    };
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
        const cwd_value = object.get("cwd_label");
        const order_value = object.get("order");
        const exit_value = object.get("last_exit_status");
        const predecessor_value = object.get("predecessor_surface_id");
        const workspace_value = object.get("workspace_id");
        const repository_value = object.get("repository_id");
        const malformed = (title_value != null and title_value.? != .string) or (cwd_value != null and cwd_value.? != .string) or
            (order_value != null and (order_value.? != .integer or order_value.?.integer < 0 or order_value.?.integer > std.math.maxInt(u32))) or
            (exit_value != null and exit_value.? != .null and (exit_value.? != .integer or exit_value.?.integer < std.math.minInt(i32) or exit_value.?.integer > std.math.maxInt(i32))) or
            (workspace_value != null and workspace_value.? != .null and (workspace_value.? != .string or !identity.isUuid(workspace_value.?.string))) or
            (repository_value != null and repository_value.? != .null and (repository_value.? != .string or !identity.isUuid(repository_value.?.string))) or
            (predecessor_value != null and predecessor_value.? != .null and (predecessor_value.? != .string or !identity.isUuid(predecessor_value.?.string)));
        if (malformed) { try result.diagnostics.append(a, .{ .index=index,.hash=shortHash(rendered),.code="invalid_record" }); continue; }
        const title = if (title_value != null) title_value.?.string else "";
        const cwd = if (cwd_value != null) cwd_value.?.string else "";
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
        const exit: ?i32 = if (exit_value != null and exit_value.? == .integer and exit_value.?.integer >= std.math.minInt(i32) and exit_value.?.integer <= std.math.maxInt(i32)) @intCast(exit_value.?.integer) else null;
        try result.records.append(a, .{ .surface_id = id, .workspace_id = ws, .repository_id = repo, .title = title, .order = order, .cwd_label = cwd, .last_exit_status = exit, .predecessor_surface_id = predecessor, .lifecycle = .ended });
    }
    return result;
}

pub fn recordsFromState(state: *const State, out: []Record) !usize {
    var count: usize = 0;
    for (state.pairs[0..state.pair_count]) |pair| for (pair.surfaces[0..pair.surface_count]) |surface| {
        if (count == out.len) return error.Capacity;
        out[count] = .{ .surface_id=surface.id,.workspace_id=pair.key.workspace_id,.repository_id=pair.key.repository_id,
            .title=surface.title[0..surface.title_len],.order=surface.order,.cwd_label=surface.cwd[0..surface.cwd_len],
            .last_exit_status=surface.last_exit_status,.predecessor_surface_id=surface.predecessor_surface_id,.lifecycle=.ended };
        count += 1;
    };
    return count;
}

pub fn applyToState(restored: *const RestoreResult, state: *State) void {
    state.organization_mode = restored.organization_mode;
    state.pin_count = 0;
    for (restored.pinned_workspace_ids.items) |pin| if (state.pin_count < state.pins.len) { state.pins[state.pin_count]=pin; state.pin_count+=1; };
    state.last_pair = restored.last_pair;
    for (restored.records.items) |record| {
        const ws=record.workspace_id orelse continue; const repo=record.repository_id orelse continue;
        const key:model.PairKey=.{.workspace_id=ws,.repository_id=repo};
        if (!model.pairValid(state,key)) continue;
        const pi=model.pairIndex(state,key) orelse continue; var pair=&state.pairs[pi];
        if(pair.surface_count==pair.surfaces.len)continue;
        var surface:model.Surface=.{.id=record.surface_id,.lifecycle=.ended,.order=record.order,.last_exit_status=record.last_exit_status,.predecessor_surface_id=record.predecessor_surface_id};
        surface.title_len=@intCast(@min(record.title.len,surface.title.len));@memcpy(surface.title[0..surface.title_len],record.title[0..surface.title_len]);
        surface.cwd_len=@intCast(@min(record.cwd_label.len,surface.cwd.len));@memcpy(surface.cwd[0..surface.cwd_len],record.cwd_label[0..surface.cwd_len]);
        pair.surfaces[pair.surface_count]=surface;pair.surface_count+=1;
    }
    for(state.pairs[0..state.pair_count])|*pair|std.mem.sort(model.Surface,pair.surfaces[0..pair.surface_count],{},struct{fn less(_:void,a:model.Surface,b:model.Surface)bool{return a.order<b.order;}}.less);
    model.reconcile(state);
}

pub fn writeStateAtomic(allocator:std.mem.Allocator,path:[]const u8,state:*const State)!void {
    var records:[512]Record=undefined;const count=try recordsFromState(state,&records);
    const bytes=try encodePresentationAlloc(allocator,.{.organization_mode=state.organization_mode,.pinned_workspace_ids=state.pins[0..state.pin_count],.last_pair=state.last_pair,.records=records[0..count]});defer allocator.free(bytes);
    const directory=std.fs.path.dirname(path) orelse return error.InvalidPath;try std.fs.cwd().makePath(directory);
    try std.posix.fchmodat(std.posix.AT.FDCWD,directory,0o700,0);
    var tmp_buf:[std.fs.max_path_bytes]u8=undefined;const tmp=try std.fmt.bufPrint(&tmp_buf,"{s}.tmp",.{path});
    std.fs.deleteFileAbsolute(tmp) catch |err| if(err!=error.FileNotFound)return err;
    const file=try std.fs.createFileAbsolute(tmp,.{.exclusive=true,.mode=0o600});errdefer std.fs.deleteFileAbsolute(tmp) catch {};defer file.close();
    try file.writeAll(bytes);try file.sync();try std.fs.renameAbsolute(tmp,path);
}

pub fn restoreStateFile(allocator:std.mem.Allocator,path:[]const u8,state:*State)!usize {
    const file=try std.fs.openFileAbsolute(path,.{});defer file.close();
    const stat=try file.stat();if(!isSafeMode(@intCast(stat.mode),false))return error.UnsafePermissions;
    const bytes=try file.readToEndAlloc(allocator,1024*1024);defer allocator.free(bytes);
    var restored=try restore(allocator,bytes);defer restored.deinit();const quarantined=restored.diagnostics.items.len;applyToState(&restored,state);return quarantined;
}

pub fn isSafeMode(mode: u32, directory: bool) bool {
    return (mode & 0o077) == 0 and (mode & if (directory) @as(u32, 0o700) else @as(u32, 0o600)) != 0;
}

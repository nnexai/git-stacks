const std = @import("std");

pub const Id = [36]u8;
pub const Connection = enum { disconnected_no_snapshot, connecting, ready, stale, refresh_required, incompatible, failed };
pub const Lifecycle = enum { live, ended, failed_cleanup };
pub const OrganizationMode = enum { simple, label, repository };
pub const AttentionStatus = enum { failed, waiting, completed, working, idle };
pub const Severity = enum(u8) { none, secondary, primary };
pub const FallbackReason = enum { exact_surface, ended_predecessor, repository, workspace, unresolved };

pub const PairKey = struct {
    workspace_id: Id,
    repository_id: Id,
    pub fn eql(a: PairKey, b: PairKey) bool {
        return std.mem.eql(u8, &a.workspace_id, &b.workspace_id) and std.mem.eql(u8, &a.repository_id, &b.repository_id);
    }
};
pub const Workspace = struct { id: Id, repository_ids: [8]Id = undefined, repository_count: u8 = 0 };
pub const Surface = struct { id: Id, generation: u64 = 0, predecessor_surface_id: ?Id = null, lifecycle: Lifecycle = .ended, order: u32 = 0, title: [64]u8 = [_]u8{0} ** 64, title_len: u8 = 0, cwd: [128]u8 = [_]u8{0} ** 128, cwd_len: u8 = 0, last_exit_status: ?i32 = null };
pub const PairCollection = struct { key: PairKey, surfaces: [16]Surface = undefined, surface_count: u8 = 0 };
pub const Attention = struct { id: Id, workspace_id: Id, repository_id: ?Id = null, surface_id: ?Id = null, predecessor_surface_id: ?Id = null, status: AttentionStatus, read: bool = false, resolved: bool = true };
pub const Aggregate = struct { unread: u32 = 0, severity: Severity = .none };
pub const FocusRoute = struct { workspace_id: Id, repository_id: ?Id = null, surface_id: ?Id = null, reason: FallbackReason };

pub const State = struct {
    connection: Connection = .disconnected_no_snapshot,
    revision: u64 = 0,
    sequence: u64 = 0,
    has_snapshot: bool = false,
    degraded_optional_count: u32 = 0,
    duplicate_count: u32 = 0,
    surface: ?Surface = null,
    attention_id: ?Id = null,
    organization_mode: OrganizationMode = .simple,
    workspaces: [16]Workspace = undefined,
    workspace_count: u8 = 0,
    pins: [16]Id = undefined,
    pin_count: u8 = 0,
    vanished_pin_notice_count: u32 = 0,
    selected_pair: ?PairKey = null,
    last_pair: ?PairKey = null,
    pairs: [32]PairCollection = undefined,
    pair_count: u8 = 0,
    attention: [64]Attention = undefined,
    attention_count: u8 = 0,
};

pub fn severity(status: AttentionStatus) Severity {
    return switch (status) {
        .failed, .waiting => .primary,
        .completed => .secondary,
        .working, .idle => .none,
    };
}
pub fn aggregate(state: *const State, workspace_id: Id, repository_id: ?Id, surface_id: ?Id) Aggregate {
    var result: Aggregate = .{};
    for (state.attention[0..state.attention_count]) |item| {
        if (!std.mem.eql(u8, &item.workspace_id, &workspace_id)) continue;
        if (repository_id) |rid| {
            if (item.repository_id == null or !std.mem.eql(u8, &item.repository_id.?, &rid)) continue;
        }
        if (surface_id) |sid| {
            if (item.surface_id == null or !std.mem.eql(u8, &item.surface_id.?, &sid)) continue;
        }
        if (!item.read and severity(item.status) != .none) {
            result.unread += 1;
            result.severity = @enumFromInt(@max(@intFromEnum(result.severity), @intFromEnum(severity(item.status))));
        }
    }
    return result;
}
pub fn pairIndex(state: *const State, key: PairKey) ?usize {
    for (state.pairs[0..state.pair_count], 0..) |pair, i| if (PairKey.eql(pair.key, key)) return i;
    return null;
}
pub fn surfaceLocation(state: *const State, id: Id) ?struct { pair: usize, surface: usize } {
    for (state.pairs[0..state.pair_count], 0..) |pair, p| for (pair.surfaces[0..pair.surface_count], 0..) |s, i| if (std.mem.eql(u8, &s.id, &id)) return .{ .pair = p, .surface = i };
    return null;
}
pub fn pairValid(state: *const State, key: PairKey) bool {
    for (state.workspaces[0..state.workspace_count]) |ws| if (std.mem.eql(u8, &ws.id, &key.workspace_id)) for (ws.repository_ids[0..ws.repository_count]) |rid| if (std.mem.eql(u8, &rid, &key.repository_id)) return true;
    return false;
}
pub fn workspaceValid(state: *const State, id: Id) bool {
    for (state.workspaces[0..state.workspace_count]) |ws| if (std.mem.eql(u8, &ws.id, &id)) return true;
    return false;
}
pub fn reconcile(state: *State) void {
    var write: usize = 0;
    var removed: u32 = 0;
    for (state.pins[0..state.pin_count]) |pin| {
        var found = false;
        for (state.workspaces[0..state.workspace_count]) |ws| if (std.mem.eql(u8, &pin, &ws.id)) {
            found = true;
            break;
        };
        if (found) {
            state.pins[write] = pin;
            write += 1;
        } else removed += 1;
    }
    state.pin_count = @intCast(write);
    state.vanished_pin_notice_count += removed;
    if (state.last_pair) |key| if (pairValid(state, key)) {
        state.selected_pair = key;
        return;
    };
    for (state.pins[0..state.pin_count]) |pin| for (state.workspaces[0..state.workspace_count]) |ws| if (std.mem.eql(u8, &pin, &ws.id) and ws.repository_count > 0) {
        state.selected_pair = .{ .workspace_id = ws.id, .repository_id = ws.repository_ids[0] };
        return;
    };
    if (state.workspace_count > 0 and state.workspaces[0].repository_count > 0) state.selected_pair = .{ .workspace_id = state.workspaces[0].id, .repository_id = state.workspaces[0].repository_ids[0] } else state.selected_pair = null;
}
pub fn canonicalAlloc(allocator: std.mem.Allocator, state: State) ![]u8 {
    const surface_id = if (state.surface) |s| s.id[0..] else "";
    const predecessor = if (state.surface) |s| if (s.predecessor_surface_id) |id| id[0..] else "" else "";
    return std.fmt.allocPrint(allocator, "{{\"connection\":\"{s}\",\"revision\":{d},\"sequence\":{d},\"has_snapshot\":{},\"degraded_optional_count\":{d},\"duplicate_count\":{d},\"surface_id\":\"{s}\",\"predecessor_surface_id\":\"{s}\",\"pair_count\":{d},\"attention_count\":{d}}}", .{ @tagName(state.connection), state.revision, state.sequence, state.has_snapshot, state.degraded_optional_count, state.duplicate_count, surface_id, predecessor, state.pair_count, state.attention_count });
}

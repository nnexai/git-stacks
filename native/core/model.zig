const std = @import("std");

pub const Id = [36]u8;
pub const Connection = enum { disconnected_no_snapshot, connecting, ready, stale, refresh_required, incompatible, failed };
pub const Lifecycle = enum { live, ended, failed_cleanup };
pub const TerminalKind = enum { shell, configured_command };
pub const OrganizationMode = enum { simple, label, repository };
pub const RepositoryRemote = enum { available, missing, not_applicable };
pub const PullRequestState = enum { open, draft, merged, closed };
pub const CheckState = enum { pending, passing, failing };
pub const SignalState = enum { failed, waiting, completed, working, idle };
pub const SignalSource = enum { claude, copilot, codex, opencode, automation, acp, user, other };
pub const SignalKind = enum { activity, notification };
pub const Severity = enum(u8) { none, secondary, primary };
pub const FallbackReason = enum { exact_surface, ended_predecessor, repository, workspace, unresolved };
pub const CapacityKind = enum { workspaces, repositories, authoritative_pairs, live_pair_identities, orphan_tombstones, surfaces, commands, signal_items, string_bytes };
pub const CapacityFailure = struct { kind: CapacityKind, maximum: u32, attempted: u32 };

pub const NativeModelLimits = struct {
    pub const workspaces = 16;
    pub const labels_per_workspace = 16;
    pub const repositories_per_workspace = 8;
    pub const authoritative_pairs = 32;
    pub const live_pair_identities = 32;
    pub const reserved_orphan_tombstones = 32;
    pub const surfaces_per_pair = 16;
    pub const commands = 64;
    pub const signal_items = 64;
    pub const workspace_name_bytes = 96;
    pub const workspace_label_bytes = 64;
    pub const repository_name_bytes = 96;
    pub const command_id_bytes = 64;
    pub const command_name_bytes = 96;
    pub const surface_command_id_bytes = 64;
    pub const surface_title_bytes = 64;
    pub const surface_cwd_bytes = 128;
    pub const signal_id_bytes = 64;
    pub const signal_title_bytes = 160;
    pub const signal_detail_bytes = 500;
    pub const signal_occurred_at_bytes = 40;
};

pub const PairKey = struct {
    workspace_id: Id,
    repository_id: Id,
    pub fn eql(a: PairKey, b: PairKey) bool {
        return std.mem.eql(u8, &a.workspace_id, &b.workspace_id) and std.mem.eql(u8, &a.repository_id, &b.repository_id);
    }
};
pub const PullRequestPresentation = struct { number: u32, state: PullRequestState, checks: ?CheckState = null };
pub const RepositoryPresentation = struct {
    branch: [96]u8 = [_]u8{0} ** 96, branch_len: u8 = 0,
    default_branch: [96]u8 = [_]u8{0} ** 96, default_branch_len: u8 = 0,
    exists: bool = true, dirty: bool = false, ahead: u32 = 0, behind: u32 = 0,
    additions: u64 = 0, removals: u64 = 0, remote: RepositoryRemote = .available,
    degraded: bool = false, pull_request: ?PullRequestPresentation = null,
};
pub const NamedRepository = struct { id: Id = [_]u8{0} ** 36, name: [96]u8 = [_]u8{0} ** 96, name_len: u8 = 0, presentation: ?RepositoryPresentation = null };
pub const Workspace = struct {
    id: Id,
    revision: u64 = 0,
    priority: i32 = 0,
    name: [96]u8 = [_]u8{0} ** 96,
    name_len: u8 = 0,
    labels: [16][64]u8 = [_][64]u8{[_]u8{0} ** 64} ** 16,
    label_lens: [16]u8 = [_]u8{0} ** 16,
    label_count: u8 = 0,
    repositories: [8]NamedRepository = [_]NamedRepository{.{}} ** 8,
    repository_ids: [8]Id = undefined,
    repository_count: u8 = 0,
};
pub const Command = struct { id: [64]u8 = [_]u8{0} ** 64, id_len: u8 = 0, workspace_id: Id, repository_id: ?Id = null, name: [96]u8 = [_]u8{0} ** 96, name_len: u8 = 0 };
pub const Surface = struct { id: Id, generation: u64 = 0, predecessor_surface_id: ?Id = null, lifecycle: Lifecycle = .ended, kind: TerminalKind = .shell, command_id: [64]u8 = [_]u8{0} ** 64, command_id_len: u8 = 0, order: u32 = 0, title: [64]u8 = [_]u8{0} ** 64, title_len: u8 = 0, title_pinned: bool = false, cwd: [128]u8 = [_]u8{0} ** 128, cwd_len: u8 = 0, last_exit_status: ?i32 = null };
pub const PairCollection = struct { key: PairKey, surfaces: [16]Surface = undefined, surface_count: u8 = 0 };
pub const Signal = struct { id: Id, signal_id: [64]u8 = [_]u8{0} ** 64, signal_id_len: u8 = 0, kind: SignalKind = .activity, provider: SignalSource = .other, title: [160]u8 = [_]u8{0} ** 160, title_len: u8 = 0, detail: [500]u8 = [_]u8{0} ** 500, detail_len: u16 = 0, occurred_at: [40]u8 = [_]u8{0} ** 40, occurred_at_len: u8 = 0, workspace_id: Id, repository_id: ?Id = null, surface_id: ?Id = null, predecessor_surface_id: ?Id = null, status: SignalState, read: bool = false, resolved: bool = true };

pub fn utf8Prefix(value: []const u8, maximum: usize) ?[]const u8 {
    if (!std.unicode.utf8ValidateSlice(value)) return null;
    var end = @min(value.len, maximum);
    while (end > 0 and !std.unicode.utf8ValidateSlice(value[0..end])) end -= 1;
    return value[0..end];
}
pub const OrphanPairTombstone = struct { key: PairKey, workspace_name: [96]u8 = [_]u8{0} ** 96, workspace_name_len: u8 = 0, repository_name: [96]u8 = [_]u8{0} ** 96, repository_name_len: u8 = 0, surfaces: [16]Surface = undefined, surface_count: u8 = 0 };
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
    organization_mode: OrganizationMode = .label,
    workspaces: [16]Workspace = undefined,
    workspace_count: u8 = 0,
    pins: [16]Id = undefined,
    pin_count: u8 = 0,
    vanished_pin_notice_count: u32 = 0,
    selected_pair: ?PairKey = null,
    last_pair: ?PairKey = null,
    pairs: [32]PairCollection = undefined,
    pair_count: u8 = 0,
    live_pair_identities: [32]PairKey = undefined,
    live_pair_identity_count: u8 = 0,
    orphan_tombstones: [32]OrphanPairTombstone = undefined,
    orphan_tombstone_count: u8 = 0,
    commands: [64]Command = undefined,
    command_count: u8 = 0,
    signals: [64]Signal = undefined,
    signal_count: u8 = 0,
    signal_overflow_count: u32 = 0,
    capacity_failure: ?CapacityFailure = null,
};

comptime {
    const s: State = .{};
    if (s.workspaces.len != NativeModelLimits.workspaces or s.pairs.len != NativeModelLimits.authoritative_pairs or s.live_pair_identities.len != NativeModelLimits.live_pair_identities or s.orphan_tombstones.len != NativeModelLimits.reserved_orphan_tombstones or s.commands.len != NativeModelLimits.commands or s.signals.len != NativeModelLimits.signal_items) @compileError("native model limit drift");
    const ws: Workspace = undefined;
    const pair: PairCollection = undefined;
    if (ws.labels.len != NativeModelLimits.labels_per_workspace or ws.repositories.len != NativeModelLimits.repositories_per_workspace or pair.surfaces.len != NativeModelLimits.surfaces_per_pair) @compileError("native nested limit drift");
}

pub fn severity(status: SignalState) Severity {
    return switch (status) {
        .failed, .waiting => .primary,
        .completed, .working, .idle => .none,
    };
}
pub fn aggregate(state: *const State, workspace_id: Id, repository_id: ?Id, surface_id: ?Id) Aggregate {
    var result: Aggregate = .{};
    for (state.signals[0..state.signal_count]) |item| {
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
pub fn orphanIndex(state: *const State, key: PairKey) ?usize {
    for (state.orphan_tombstones[0..state.orphan_tombstone_count], 0..) |pair, i| if (PairKey.eql(pair.key, key)) return i;
    return null;
}
pub fn pairOrOrphanValid(state: *const State, key: PairKey) bool { return pairValid(state, key) or orphanIndex(state, key) != null; }
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
    if (state.workspace_count > state.workspaces.len or state.pair_count > state.pairs.len or state.command_count > state.commands.len) return error.InvalidState;
    for (state.workspaces[0..state.workspace_count]) |ws| {
        if (ws.name_len > ws.name.len or ws.repository_count > ws.repository_ids.len) return error.InvalidState;
        for (ws.repositories[0..ws.repository_count]) |repo| if (repo.name_len > repo.name.len) return error.InvalidState;
    }
    for (state.commands[0..state.command_count]) |command| if (command.id_len > command.id.len or command.name_len > command.name.len) return error.InvalidState;
    const surface_id = if (state.surface) |s| s.id[0..] else "";
    const predecessor = if (state.surface) |s| if (s.predecessor_surface_id) |id| id[0..] else "" else "";
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    const w = out.writer(allocator);
    try w.print("{{\"connection\":\"{s}\",\"revision\":{d},\"sequence\":{d},\"has_snapshot\":{},\"degraded_optional_count\":{d},\"duplicate_count\":{d},\"signal_overflow_count\":{d},\"capacity_failure\":", .{ @tagName(state.connection), state.revision, state.sequence, state.has_snapshot, state.degraded_optional_count, state.duplicate_count, state.signal_overflow_count });
    if (state.capacity_failure) |failure| try w.print("{{\"kind\":\"{s}\",\"maximum\":{d},\"attempted\":{d}}}", .{ @tagName(failure.kind), failure.maximum, failure.attempted }) else try w.writeAll("null");
    try w.print(",\"surface_id\":\"{s}\",\"predecessor_surface_id\":\"{s}\",\"workspaces\":[", .{ surface_id, predecessor });
    for (state.workspaces[0..state.workspace_count], 0..) |ws, i| {
        if (i != 0) try w.writeByte(',');
        const summary = aggregate(&state, ws.id, null, null);
        try w.print("{{\"id\":\"{s}\",\"name\":{f},\"unread\":{d},\"severity\":\"{s}\",\"repositories\":[", .{ ws.id, std.json.fmt(ws.name[0..ws.name_len], .{}), summary.unread, @tagName(summary.severity) });
        for (ws.repository_ids[0..ws.repository_count], 0..) |rid, j| {
            if (j != 0) try w.writeByte(',');
            try w.print("{{\"id\":\"{s}\",\"name\":{f}}}", .{ rid, std.json.fmt(ws.repositories[j].name[0..ws.repositories[j].name_len], .{}) });
        }
        try w.writeAll("]}");
    }
    try w.writeAll("],\"pairs\":[");
    for (state.pairs[0..state.pair_count], 0..) |pair, i| {
        if (i != 0) try w.writeByte(',');
        const summary = aggregate(&state, pair.key.workspace_id, pair.key.repository_id, null);
        try w.print("{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\",\"unread\":{d},\"severity\":\"{s}\",\"surfaces\":[", .{ pair.key.workspace_id, pair.key.repository_id, summary.unread, @tagName(summary.severity) });
        for (pair.surfaces[0..pair.surface_count], 0..) |s, j| {
            if (j != 0) try w.writeByte(',');
            const surface_summary = aggregate(&state, pair.key.workspace_id, pair.key.repository_id, s.id);
            try w.print("{{\"id\":\"{s}\",\"generation\":{d},\"lifecycle\":\"{s}\",\"kind\":\"{s}\",\"command_id\":{f},\"order\":{d},\"unread\":{d},\"severity\":\"{s}\",\"title\":", .{ s.id, s.generation, @tagName(s.lifecycle), @tagName(s.kind), std.json.fmt(s.command_id[0..s.command_id_len], .{}), s.order, surface_summary.unread, @tagName(surface_summary.severity) });
            try w.print("{f}", .{std.json.fmt(s.title[0..s.title_len], .{})});
            try w.writeAll(",\"cwd\":");
            try w.print("{f}", .{std.json.fmt(s.cwd[0..s.cwd_len], .{})});
            try w.writeByte('}');
        }
        try w.writeAll("]}");
    }
    try w.writeAll("],\"commands\":[");
    for (state.commands[0..state.command_count], 0..) |command, i| {
        if (i != 0) try w.writeByte(',');
        try w.print("{{\"id\":{f},\"name\":{f},\"workspace_id\":\"{s}\",\"repository_id\":", .{ std.json.fmt(command.id[0..command.id_len], .{}), std.json.fmt(command.name[0..command.name_len], .{}), command.workspace_id });
        if (command.repository_id) |id| try w.print("\"{s}\"", .{id}) else try w.writeAll("null");
        try w.writeByte('}');
    }
    try w.writeAll("],\"signals\":[");
    for (state.signals[0..state.signal_count], 0..) |item, i| {
        if (i != 0) try w.writeByte(',');
        try w.print("{{\"id\":\"{s}\",\"signal_id\":{f},\"kind\":\"{s}\",\"provider\":\"{s}\",\"title\":{f},\"detail\":{f},\"occurred_at\":{f},\"workspace_id\":\"{s}\",\"repository_id\":", .{ item.id, std.json.fmt(item.signal_id[0..item.signal_id_len], .{}), @tagName(item.kind), @tagName(item.provider), std.json.fmt(item.title[0..item.title_len], .{}), std.json.fmt(item.detail[0..item.detail_len], .{}), std.json.fmt(item.occurred_at[0..item.occurred_at_len], .{}), item.workspace_id });
        if (item.repository_id) |id| try w.print("\"{s}\"", .{id}) else try w.writeAll("null");
        try w.writeAll(",\"surface_id\":");
        if (item.surface_id) |id| try w.print("\"{s}\"", .{id}) else try w.writeAll("null");
        try w.print(",\"status\":\"{s}\",\"read\":{},\"resolved\":{}}}", .{ @tagName(item.status), item.read, item.resolved });
    }
    try w.print("],\"pair_count\":{d},\"command_count\":{d},\"signal_count\":{d}}}", .{ state.pair_count, state.command_count, state.signal_count });
    return out.toOwnedSlice(allocator);
}

const std = @import("std");
const model = @import("model");

pub const Page = enum { loading, empty, disconnected, stale, incompatible, refresh_required, failure, workspace };
pub const StatusAction = enum { none, create_workspace, retry_connection, refresh, details };
pub const StatusPresentation = struct { page: Page, action: StatusAction, title: []const u8, description: []const u8, retain_workspace: bool = false, mutations_enabled: bool = false };
pub const Organization = model.OrganizationMode;
pub const WorkspaceSection = enum { pinned, active, ordinary };
pub const WorkspaceCompressionTier = enum { wide, medium, narrow, text_200 };
pub const CompressionVisibility = struct { secondary: bool, git: bool, pr_expanded: bool, agent_limit: u8 };
pub fn compression(tier: WorkspaceCompressionTier) CompressionVisibility {
    return switch (tier) {
        .wide => .{ .secondary = true, .git = true, .pr_expanded = true, .agent_limit = 3 },
        .medium => .{ .secondary = false, .git = true, .pr_expanded = true, .agent_limit = 3 },
        .narrow => .{ .secondary = true, .git = true, .pr_expanded = false, .agent_limit = 1 },
        .text_200 => .{ .secondary = true, .git = false, .pr_expanded = false, .agent_limit = 1 },
    };
}
pub fn compressionForAllocation(width: i32, text_percent: u16) WorkspaceCompressionTier {
    if (text_percent >= 200) return .text_200;
    if (width < 360) return .narrow;
    if (width < 520) return .medium;
    return .wide;
}
pub const InteractionSemantics = struct { selected_class: []const u8, focus_class: []const u8, preserve_unread_error: bool = true };
pub fn interaction(selected: bool, window_active: bool, keyboard_focus: bool) InteractionSemantics {
    return .{ .selected_class = if (!selected) "" else if (window_active) "selected-workspace" else "selected-workspace-inactive", .focus_class = if (keyboard_focus) "keyboard-focus" else "" };
}
pub const WorkspaceRowProjection = struct {
    key: model.PairKey, section: WorkspaceSection, selected: bool,
    pinned: bool, unread: bool, awaiting: bool, agent_count: u8, agent_overflow: u8 = 0, provider_badges: [3]ProviderBadge = [_]ProviderBadge{.{}} ** 3, provider_badge_count: u8 = 0, running: bool, activity: bool,
    completed: bool = false, failed: bool = false,
    visibility: CompressionVisibility, accessible: [512]u8 = [_]u8{0} ** 512, accessible_len: u16 = 0,
};
pub const ProviderBadge = struct { provider: model.SignalSource = .other, awaiting: bool = false, signal_id: [64]u8 = [_]u8{0} ** 64, signal_id_len: u8 = 0 };
fn providerLess(_: void, a: ProviderBadge, b: ProviderBadge) bool {
    if (a.awaiting != b.awaiting) return a.awaiting;
    if (@intFromEnum(a.provider) != @intFromEnum(b.provider)) return @intFromEnum(a.provider) < @intFromEnum(b.provider);
    return std.mem.order(u8, a.signal_id[0..a.signal_id_len], b.signal_id[0..b.signal_id_len]) == .lt;
}
pub fn providerLetter(provider: model.SignalSource) []const u8 { return switch (provider) { .claude => "C", .copilot => "G", .codex => "X", .opencode => "O", .automation => "A", .acp => "P", .user => "U", .other => "?" }; }
pub const WorkspaceProjection = struct {
    rows: [32]WorkspaceRowProjection = undefined, row_count: u8 = 0,
    pinned_origin_count: u8 = 0,
};
pub const SidebarGroupKind = enum { pinned, active, label, repository };
pub const SidebarGroup = struct {
    kind: SidebarGroupKind = .label,
    title: [96]u8 = [_]u8{0} ** 96,
    title_len: u8 = 0,
    row_indexes: [32]u8 = [_]u8{0} ** 32,
    row_count: u8 = 0,
};
pub const SidebarProjection = struct {
    workspace: WorkspaceProjection,
    groups: [64]SidebarGroup = [_]SidebarGroup{.{}} ** 64,
    group_count: u8 = 0,
    group_overflow_count: u16 = 0,
};
fn pinned(state: *const model.State, wid: model.Id) bool { for (state.pins[0..state.pin_count]) |value| if (std.mem.eql(u8, &value, &wid)) return true; return false; }
fn workspaceIndex(state: *const model.State, wid: model.Id) ?usize { for (state.workspaces[0..state.workspace_count], 0..) |ws, i| if (std.mem.eql(u8, &ws.id, &wid)) return i; return null; }
pub fn workspaceIndexForKey(state: *const model.State, key: model.PairKey) ?usize { return workspaceIndex(state, key.workspace_id); }
pub fn repositoryIndexForKey(ws: *const model.Workspace, repository_id: model.Id) ?usize { for (ws.repository_ids[0..ws.repository_count], 0..) |rid, i| if (std.mem.eql(u8, &rid, &repository_id)) return i; return null; }
fn lessRow(state: *const model.State, a: WorkspaceRowProjection, b: WorkspaceRowProjection) bool {
    if (@intFromEnum(a.section) != @intFromEnum(b.section)) return @intFromEnum(a.section) < @intFromEnum(b.section);
    const aw = &state.workspaces[workspaceIndex(state, a.key.workspace_id).?]; const bw = &state.workspaces[workspaceIndex(state, b.key.workspace_id).?];
    const order = std.ascii.orderIgnoreCase(aw.name[0..aw.name_len], bw.name[0..bw.name_len]);
    if (order != .eq) return order == .lt;
    const id_order = std.mem.order(u8, &a.key.workspace_id, &b.key.workspace_id);
    if (id_order != .eq) return id_order == .lt;
    return std.mem.order(u8, &a.key.repository_id, &b.key.repository_id) == .lt;
}
fn describe(state: *const model.State, row: *WorkspaceRowProjection) void {
    const wi = workspaceIndex(state, row.key.workspace_id).?; const ws = &state.workspaces[wi];
    var ri: usize = 0; for (ws.repository_ids[0..ws.repository_count], 0..) |rid, i| if (std.mem.eql(u8, &rid, &row.key.repository_id)) { ri = i; break; };
    const repo = &ws.repositories[ri]; var stream = std.io.fixedBufferStream(&row.accessible); const w = stream.writer();
    w.print("{s}, repository {s}", .{ ws.name[0..ws.name_len], repo.name[0..repo.name_len] }) catch {};
    if (repo.presentation) |p| {
        w.print(", branch {s}", .{p.branch[0..p.branch_len]}) catch {};
        if (std.mem.eql(u8, p.branch[0..p.branch_len], p.default_branch[0..p.default_branch_len])) w.writeAll(", default branch") catch {};
        w.print(", Git +{d} -{d}", .{ p.additions, p.removals }) catch {};
        if (!p.exists) w.writeAll(", missing repository") catch {};
        if (p.degraded) w.writeAll(", degraded") catch {};
        if (p.pull_request) |pr| { w.print(", pull request {d} {s}", .{ pr.number, @tagName(pr.state) }) catch {}; if (pr.checks) |checks| w.print(", checks {s}", .{@tagName(checks)}) catch {}; }
    }
    if (row.pinned) w.writeAll(", pinned") catch {};
    if (row.agent_count > 0) {
        w.print(", {d} agent sessions", .{row.agent_count}) catch {};
        inline for (.{ model.SignalSource.claude, .copilot, .codex, .opencode, .automation, .acp, .user, .other }) |provider| {
            var count: u8 = 0; for (state.signals[0..state.signal_count]) |signal| if (signal.kind == .activity and signal.provider == provider and std.mem.eql(u8, &signal.workspace_id, &row.key.workspace_id) and (signal.repository_id == null or std.mem.eql(u8, &signal.repository_id.?, &row.key.repository_id)) and (signal.status == .working or signal.status == .waiting or signal.status == .failed)) { count += 1; };
            if (count > 0) w.print(", {d} {s}", .{ count, @tagName(provider) }) catch {};
        }
    }
    if (row.awaiting) w.writeAll(", awaiting input") catch {};
    if (row.running) w.writeAll(", running") catch {};
    if (row.activity) w.writeAll(", activity") catch {};
    if (row.completed) w.writeAll(", completed") catch {};
    if (row.failed) w.writeAll(", failed") catch {};
    if (row.unread) w.writeAll(", unread") catch {};
    row.accessible_len = @intCast(stream.pos);
}
pub fn project(state: *const model.State, tier: WorkspaceCompressionTier) WorkspaceProjection {
    var out: WorkspaceProjection = .{};
    for (state.pairs[0..state.pair_count]) |pair| {
        var unread = false; var awaiting = false; var agents: u8 = 0; var activity = false; var completed = false; var failed = false; var badges: [64]ProviderBadge = [_]ProviderBadge{.{}} ** 64; var badge_count: u8 = 0;
        for (state.signals[0..state.signal_count]) |signal| if (std.mem.eql(u8, &signal.workspace_id, &pair.key.workspace_id) and (signal.repository_id == null or std.mem.eql(u8, &signal.repository_id.?, &pair.key.repository_id))) {
            if (signal.kind == .notification and !signal.read) unread = true;
            if (signal.kind == .activity and (signal.status == .working or signal.status == .waiting or signal.status == .failed)) {
                agents +|= 1; if (signal.status == .waiting) awaiting = true; if (signal.status == .working) activity = true; if (signal.status == .failed) failed = true;
                badges[badge_count] = .{ .provider = signal.provider, .awaiting = signal.status == .waiting, .signal_id_len = signal.signal_id_len };
                @memcpy(badges[badge_count].signal_id[0..signal.signal_id_len], signal.signal_id[0..signal.signal_id_len]); badge_count += 1;
            } else if (signal.kind == .activity and signal.status == .completed) completed = true;
        };
        std.mem.sort(ProviderBadge, badges[0..badge_count], {}, providerLess);
        var running = false; for (pair.surfaces[0..pair.surface_count]) |surface| if (surface.lifecycle == .live and surface.kind == .configured_command) { running = true; break; };
        const is_pinned = pinned(state, pair.key.workspace_id);
        var row: WorkspaceRowProjection = .{ .key = pair.key, .section = if (is_pinned) .pinned else if (activity or running) .active else .ordinary, .selected = if (state.selected_pair) |key| model.PairKey.eql(key, pair.key) else false, .pinned = is_pinned, .unread = unread, .awaiting = awaiting, .agent_count = agents, .agent_overflow = agents -| @min(agents, compression(tier).agent_limit), .running = running, .activity = activity, .completed = completed, .failed = failed, .visibility = compression(tier) };
        row.provider_badge_count = @min(@as(u8, 3), @min(badge_count, row.visibility.agent_limit)); for (0..row.provider_badge_count) |i| row.provider_badges[i] = badges[i];
        describe(state, &row); out.rows[out.row_count] = row; out.row_count += 1;
        if (is_pinned) out.pinned_origin_count += 1;
    }
    std.mem.sort(WorkspaceRowProjection, out.rows[0..out.row_count], state, lessRow);
    return out;
}
fn groupLess(_: void, a: SidebarGroup, b: SidebarGroup) bool {
    if (a.kind == .pinned or b.kind == .pinned) return a.kind == .pinned and b.kind != .pinned;
    if (a.kind == .active or b.kind == .active) return a.kind == .active and b.kind != .active;
    const order = std.ascii.orderIgnoreCase(a.title[0..a.title_len], b.title[0..b.title_len]);
    if (order != .eq) return order == .lt;
    return @intFromEnum(a.kind) < @intFromEnum(b.kind);
}
fn appendGroupRow(sidebar: *SidebarProjection, kind: SidebarGroupKind, title: []const u8, row_index: u8) void {
    for (sidebar.groups[0..sidebar.group_count]) |*group| {
        if (group.kind == kind and std.mem.eql(u8, group.title[0..group.title_len], title)) {
            if (group.row_count < group.row_indexes.len) {
                group.row_indexes[group.row_count] = row_index;
                group.row_count += 1;
            }
            return;
        }
    }
    if (sidebar.group_count == sidebar.groups.len) {
        sidebar.group_overflow_count +|= 1;
        return;
    }
    const index = sidebar.group_count;
    const safe_title = model.utf8Prefix(title, sidebar.groups[index].title.len) orelse return;
    sidebar.groups[index].kind = kind;
    sidebar.groups[index].title_len = @intCast(safe_title.len);
    @memcpy(sidebar.groups[index].title[0..safe_title.len], safe_title);
    sidebar.groups[index].row_indexes[0] = row_index;
    sidebar.groups[index].row_count = 1;
    sidebar.group_count += 1;
}
pub fn projectSidebar(state: *const model.State, tier: WorkspaceCompressionTier) SidebarProjection {
    var sidebar: SidebarProjection = .{ .workspace = project(state, tier) };
    for (sidebar.workspace.rows[0..sidebar.workspace.row_count], 0..) |row, row_index| {
        if (row.section == .pinned) {
            appendGroupRow(&sidebar, .pinned, "Pinned", @intCast(row_index));
            continue;
        }
        if (row.section == .active) {
            appendGroupRow(&sidebar, .active, "Active", @intCast(row_index));
            continue;
        }
        const wi = workspaceIndexForKey(state, row.key) orelse continue;
        const ws = &state.workspaces[wi];
        if (state.organization_mode == .repository) {
            const ri = repositoryIndexForKey(ws, row.key.repository_id) orelse continue;
            const repo = &ws.repositories[ri];
            appendGroupRow(&sidebar, .repository, repo.name[0..repo.name_len], @intCast(row_index));
        } else if (ws.label_count == 0) {
            appendGroupRow(&sidebar, .label, "Unlabelled", @intCast(row_index));
        } else for (0..ws.label_count) |label_index| {
            appendGroupRow(&sidebar, .label, ws.labels[label_index][0..ws.label_lens[label_index]], @intCast(row_index));
        }
    }
    std.mem.sort(SidebarGroup, sidebar.groups[0..sidebar.group_count], {}, groupLess);
    return sidebar;
}
pub const OrphanRow = struct { key: model.PairKey, workspace_name: []const u8, repository_name: []const u8, orphan: bool = true, actions_enabled: bool = false };
pub fn orphanRow(state: *const model.State, index: usize) ?OrphanRow {
    if (index >= state.orphan_tombstone_count) return null;
    const item = &state.orphan_tombstones[index];
    return .{ .key = item.key, .workspace_name = item.workspace_name[0..item.workspace_name_len], .repository_name = item.repository_name[0..item.repository_name_len] };
}
pub fn firstRepositoryNameOccurrence(state: *const model.State, workspace_index: usize, repository_index: usize) bool {
    const target = state.workspaces[workspace_index].repositories[repository_index];
    const name = target.name[0..target.name_len];
    for (state.workspaces[0 .. workspace_index + 1], 0..) |ws, wi| for (ws.repositories[0..ws.repository_count], 0..) |repo, ri| {
        if (wi == workspace_index and ri == repository_index) return true;
        if (std.mem.eql(u8, repo.name[0..repo.name_len], name)) return false;
    };
    return true;
}

pub const View = struct {
    state: *model.State,
    pub fn page(self: View) Page {
        return switch (self.state.connection) {
            .connecting => .loading,
            .disconnected_no_snapshot => .disconnected,
            .stale => .stale,
            .incompatible => .incompatible,
            .refresh_required => .refresh_required,
            .failed => .failure,
            .ready => if (self.state.workspace_count == 0) .empty else .workspace,
        };
    }
    pub fn status(self: View) StatusPresentation {
        return switch (self.page()) {
            .loading => .{ .page = .loading, .action = .none, .title = "Connecting", .description = "Loading authoritative workspaces..." },
            .empty => .{ .page = .empty, .action = .create_workspace, .title = "Create your first workspace", .description = "Start from a template or one or more repositories.", .mutations_enabled = true },
            .disconnected => .{ .page = .disconnected, .action = .retry_connection, .title = "Service unavailable", .description = "Check the local service and try connecting again." },
            .stale => .{ .page = .stale, .action = .refresh, .title = "Workspace data may be out of date", .description = "You can keep reading existing terminals while changes are disabled.", .retain_workspace = true },
            .incompatible => .{ .page = .incompatible, .action = .details, .title = "Update required", .description = "The native client and local service use incompatible protocols." },
            .refresh_required => .{ .page = .refresh_required, .action = .refresh, .title = "Refresh required", .description = "The event history changed; reload authoritative workspace data." },
            .failure => .{ .page = .failure, .action = .retry_connection, .title = "Could not load workspaces", .description = "Review connection details or try again." },
            .workspace => .{ .page = .workspace, .action = .none, .title = "Workspaces", .description = "Authoritative workspace data is current.", .mutations_enabled = true },
        };
    }
    pub fn repositoryLevelVisible(self: View, workspace: usize) bool {
        return self.state.workspaces[workspace].repository_count > 1;
    }
    pub fn select(self: View, key: model.PairKey) bool {
        if (!model.pairValid(self.state, key)) return false;
        self.state.selected_pair = key;
        self.state.last_pair = key;
        return true;
    }
    pub fn setOrganization(self: View, value: Organization) void {
        self.state.organization_mode = value;
    }
    pub fn pin(self: View, id: model.Id) !void {
        for (self.state.pins[0..self.state.pin_count]) |existing| if (std.mem.eql(u8, &existing, &id)) return;
        if (!model.workspaceValid(self.state, id)) return error.UnknownWorkspace;
        if (self.state.pin_count == self.state.pins.len) return error.Capacity;
        self.state.pins[self.state.pin_count] = id;
        self.state.pin_count += 1;
    }
    pub fn unpin(self: View, id: model.Id) void {
        var w: usize = 0;
        for (self.state.pins[0..self.state.pin_count]) |entry| {
            if (!std.mem.eql(u8, &entry, &id)) {
                self.state.pins[w] = entry;
                w += 1;
            }
        }
        self.state.pin_count = @intCast(w);
    }
    pub fn reorderPin(self: View, id: model.Id, to: usize) !void {
        var from: ?usize = null;
        for (self.state.pins[0..self.state.pin_count], 0..) |entry, i| if (std.mem.eql(u8, &entry, &id)) {
            from = i;
            break;
        };
        const f = from orelse return error.UnknownWorkspace;
        if (to >= self.state.pin_count) return error.InvalidOrder;
        const item = self.state.pins[f];
        if (f < to) std.mem.copyForwards(model.Id, self.state.pins[f..to], self.state.pins[f + 1 .. to + 1]) else if (f > to) std.mem.copyBackwards(model.Id, self.state.pins[to + 1 .. f + 1], self.state.pins[to..f]);
        self.state.pins[to] = item;
    }
    pub fn pair(self: View) ?*model.PairCollection {
        const key = self.state.selected_pair orelse return null;
        const i = model.pairIndex(self.state, key) orelse return null;
        return &self.state.pairs[i];
    }
    pub fn selectTab(self: View, id: model.Id) bool {
        const loc = model.surfaceLocation(self.state, id) orelse return false;
        self.state.selected_pair = self.state.pairs[loc.pair].key;
        self.state.surface = self.state.pairs[loc.pair].surfaces[loc.surface];
        return true;
    }
    pub fn cycleTab(self: View, delta: i32) bool {
        const p = self.pair() orelse return false;
        if (p.surface_count == 0) return false;
        var current: usize = 0;
        if (self.state.surface) |s| for (p.surfaces[0..p.surface_count], 0..) |candidate, i| if (std.mem.eql(u8, &candidate.id, &s.id)) {
            current = i;
            break;
        };
        const n: @TypeOf(current) = if (delta < 0) (current + p.surface_count - 1) % p.surface_count else (current + 1) % p.surface_count;
        return self.selectTab(p.surfaces[n].id);
    }
    pub fn reorderTab(self: View, id: model.Id, to: usize) !void {
        const p = self.pair() orelse return error.UnknownPair;
        if (to >= p.surface_count) return error.InvalidOrder;
        var from: ?usize = null;
        for (p.surfaces[0..p.surface_count], 0..) |s, i| if (std.mem.eql(u8, &s.id, &id)) {
            from = i;
            break;
        };
        const f = from orelse return error.UnknownSurface;
        const item = p.surfaces[f];
        if (f < to) std.mem.copyForwards(model.Surface, p.surfaces[f..to], p.surfaces[f + 1 .. to + 1]) else if (f > to) std.mem.copyBackwards(model.Surface, p.surfaces[to + 1 .. f + 1], p.surfaces[to..f]);
        p.surfaces[to] = item;
        for (p.surfaces[0..p.surface_count], 0..) |*s, i| s.order = @intCast(i);
    }
    pub fn renameTab(self: View, id: model.Id, title: []const u8) !void {
        const loc = model.surfaceLocation(self.state, id) orelse return error.UnknownSurface;
        var s = &self.state.pairs[loc.pair].surfaces[loc.surface];
        s.title_len = @intCast(@min(title.len, s.title.len));
        @memcpy(s.title[0..s.title_len], title[0..s.title_len]);
    }
    pub fn closeTab(self: View, id: model.Id) !void {
        const loc = model.surfaceLocation(self.state, id) orelse return error.UnknownSurface;
        var p = &self.state.pairs[loc.pair];
        if (p.surfaces[loc.surface].lifecycle == .live) p.surfaces[loc.surface].lifecycle = .ended;
        if (self.state.surface) |selected| {
            if (std.mem.eql(u8, &selected.id, &id)) self.state.surface = p.surfaces[loc.surface];
        }
    }
    pub fn removeTab(self: View, id: model.Id) !void {
        const loc = model.surfaceLocation(self.state, id) orelse return error.UnknownSurface;
        var p = &self.state.pairs[loc.pair];
        for (p.surfaces[0..p.surface_count]) |surface| if (std.mem.eql(u8, &surface.id, &id) and surface.lifecycle == .live) return error.SurfaceLive;
        var write: usize = 0;
        for (p.surfaces[0..p.surface_count]) |surface| if (!std.mem.eql(u8, &surface.id, &id)) {
            p.surfaces[write] = surface;
            write += 1;
        };
        p.surface_count = @intCast(write);
        for (p.surfaces[0..p.surface_count], 0..) |*s, index| s.order = @intCast(index);
        if (self.state.surface) |selected| {
            if (std.mem.eql(u8, &selected.id, &id)) self.state.surface = if (p.surface_count > 0) p.surfaces[0] else null;
        }
    }
    pub fn publishRelaunch(self: View, predecessor: model.Id, replacement: model.Id) !void {
        const loc = model.surfaceLocation(self.state, predecessor) orelse return error.UnknownSurface;
        var p = &self.state.pairs[loc.pair];
        if (p.surfaces[loc.surface].lifecycle != .ended or model.surfaceLocation(self.state, replacement) != null) return error.InvalidRelaunch;
        var s = p.surfaces[loc.surface];
        s.id = replacement;
        s.predecessor_surface_id = predecessor;
        s.generation += 1;
        s.lifecycle = .live;
        p.surfaces[loc.surface] = s;
        self.state.surface = s;
    }
};

pub const RowBinding = struct {
    workspace_id: ?model.Id = null,
    repository_id: ?model.Id = null,
    css_pinned: bool = false,
    drag_id: ?model.Id = null,
    label_len: usize = 0,
    pub fn unbind(self: *RowBinding) void {
        self.* = .{};
    }
};

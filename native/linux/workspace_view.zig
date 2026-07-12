const std = @import("std");
const model = @import("model");

pub const Page = enum { loading, empty, disconnected, stale, incompatible, refresh_required, failure, workspace };
pub const Organization = model.OrganizationMode;
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

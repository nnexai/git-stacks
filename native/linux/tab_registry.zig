const std = @import("std");
const model = @import("model");
pub const Host = struct { surface_id: model.Id, pair: model.PairKey, generation: u64, pgid: i32, birth_token: u64, attached: bool = false, registered: bool = true };
pub const Registry = struct {
    allocator: std.mem.Allocator,
    hosts: std.ArrayList(Host) = .empty,
    pub fn init(a: std.mem.Allocator) Registry {
        return .{ .allocator = a };
    }
    pub fn deinit(self: *Registry) void {
        self.hosts.deinit(self.allocator);
    }
    pub fn register(self: *Registry, host: Host) !void {
        if (host.pgid <= 1 or host.birth_token == 0) return error.InvalidOwnership;
        if (self.find(host.surface_id) != null) return error.DuplicateSurface;
        try self.hosts.append(self.allocator, host);
    }
    pub fn find(self: *Registry, id: model.Id) ?*Host {
        for (self.hosts.items) |*h| if (std.mem.eql(u8, &h.surface_id, &id)) return h;
        return null;
    }
    pub fn attach(self: *Registry, id: model.Id) !void {
        const h = self.find(id) orelse return error.UnknownSurface;
        h.attached = true;
    }
    pub fn detach(self: *Registry, id: model.Id) !void {
        const h = self.find(id) orelse return error.UnknownSurface;
        h.attached = false;
    }
    pub fn close(self: *Registry, id: model.Id) !Host {
        for (self.hosts.items, 0..) |h, i| if (std.mem.eql(u8, &h.surface_id, &id)) return self.hosts.orderedRemove(i);
        return error.UnknownSurface;
    }
    pub fn quit(self: *Registry, output: *std.ArrayList(Host)) !void {
        while (self.hosts.items.len > 0) try output.append(self.allocator, self.hosts.pop().?);
    }
};
pub fn commitAfterRegistration(state: *model.State, registry: *Registry, host: Host) !void {
    try registry.register(host);
    errdefer _ = registry.close(host.surface_id) catch {};
    const index = model.pairIndex(state, host.pair) orelse blk: {
        if (state.pair_count >= state.pairs.len) return error.PairCapacity;
        const i = state.pair_count;
        state.pairs[i] = .{ .key = host.pair, .surfaces = undefined };
        state.pair_count += 1;
        break :blk i;
    };
    if (state.pairs[index].surface_count >= state.pairs[index].surfaces.len) return error.SurfaceCapacity;
    const n = state.pairs[index].surface_count;
    state.pairs[index].surfaces[n] = .{ .id = host.surface_id, .generation = host.generation, .lifecycle = .live, .order = n };
    state.pairs[index].surface_count += 1;
}

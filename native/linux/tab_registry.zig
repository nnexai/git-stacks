const std = @import("std");
const model = @import("model");

pub const TerminalHost = struct {
    context: *anyopaque,
    registerOwnership: *const fn (*anyopaque, i32, u64) anyerror!void,
    teardown: *const fn (*anyopaque, i32, u64) anyerror!void,
    childExited: *const fn (*anyopaque, i32, u64) anyerror!void,
    destroy: *const fn (*anyopaque) void,
};
pub const Host = struct {
    surface_id: model.Id,
    pair: model.PairKey,
    generation: u64,
    child_pid: i32 = 2,
    pgid: i32,
    birth_token: u64,
    terminal: TerminalHost,
    attached: bool = false,
    registered: bool = false,
};
pub const Registry = struct {
    allocator: std.mem.Allocator,
    hosts: std.ArrayList(Host) = .empty,
    pub fn init(a: std.mem.Allocator) Registry { return .{ .allocator = a }; }
    pub fn deinit(self: *Registry) void {
        while (self.hosts.pop()) |h| { h.terminal.teardown(h.terminal.context,h.pgid,h.birth_token) catch {}; h.terminal.destroy(h.terminal.context); }
        self.hosts.deinit(self.allocator);
    }
    pub fn register(self: *Registry, proposed: Host) !void {
        if (proposed.child_pid <= 1 or proposed.pgid <= 1 or proposed.birth_token == 0) return error.InvalidOwnership;
        if (self.find(proposed.surface_id) != null) return error.DuplicateSurface;
        var host = proposed; host.registered = false;
        try host.terminal.registerOwnership(host.terminal.context,host.pgid,host.birth_token);
        errdefer host.terminal.teardown(host.terminal.context,host.pgid,host.birth_token) catch {};
        host.registered = true;
        try self.hosts.append(self.allocator,host);
    }
    pub fn find(self:*Registry,id:model.Id)?*Host { for(self.hosts.items)|*h| if(std.mem.eql(u8,&h.surface_id,&id))return h; return null; }
    pub fn attach(self:*Registry,id:model.Id)!void { (self.find(id) orelse return error.UnknownSurface).attached=true; }
    pub fn detach(self:*Registry,id:model.Id)!void { (self.find(id) orelse return error.UnknownSurface).attached=false; }
    fn remove(self:*Registry,id:model.Id,exited:bool)!void { for(self.hosts.items,0..) |h,i| if(std.mem.eql(u8,&h.surface_id,&id)) { if(exited) try h.terminal.childExited(h.terminal.context,h.pgid,h.birth_token) else try h.terminal.teardown(h.terminal.context,h.pgid,h.birth_token); const removed=self.hosts.orderedRemove(i); removed.terminal.destroy(removed.terminal.context); return; }; return error.UnknownSurface; }
    pub fn close(self:*Registry,id:model.Id)!void { try self.remove(id,false); }
    pub fn childExited(self:*Registry,id:model.Id)!void { try self.remove(id,true); }
    pub fn quit(self:*Registry)!void { while(self.hosts.items.len>0) try self.close(self.hosts.items[self.hosts.items.len-1].surface_id); }
};
pub fn commitAfterRegistration(state:*model.State,registry:*Registry,host:Host)!void {
    try registry.register(host); errdefer registry.close(host.surface_id) catch {};
    const index=model.pairIndex(state,host.pair) orelse blk:{ if(state.pair_count>=state.pairs.len)return error.PairCapacity;const i=state.pair_count;state.pairs[i]=.{.key=host.pair,.surfaces=undefined};state.pair_count+=1;break :blk i;};
    if(state.pairs[index].surface_count>=state.pairs[index].surfaces.len)return error.SurfaceCapacity;
    const n=state.pairs[index].surface_count;state.pairs[index].surfaces[n]=.{.id=host.surface_id,.generation=host.generation,.lifecycle=.live,.order=n};state.pairs[index].surface_count+=1;
}

const std = @import("std");

pub const Connection = enum { disconnected, discovering, snapshot_loading, replaying, ready, refresh_required, incompatible, failed, shutting_down };
pub const Method = enum { GET, POST };
pub const Request = struct { method: Method, path: []const u8, authorization: []const u8, body: []const u8 = "", last_event_id: ?[]const u8 = null };
pub const Snapshot = struct { revision: u64, sequence: u64, workspace_id: [36]u8 };
pub const Event = struct { sequence: u64, kind: enum { attention, operation, heartbeat } };
pub const Outcome = union(enum) { none, snapshot: Snapshot, event: Event, duplicate, gap_refresh, incompatible, failure: []const u8, launch: Launch };

pub const Launch = struct {
    argv: [32][256]u8 = undefined,
    argv_lens: [32]u16 = [_]u16{0} ** 32,
    argv_count: u8 = 0,
    cwd: [512]u8 = [_]u8{0} ** 512,
    cwd_len: u16 = 0,
    environment_count: u16 = 0,
    port_count: u16 = 0,
    redacted_count: u16 = 0,
    revision: u64 = 0,
    shell: bool = false,
    pub fn cwdSlice(self: *const Launch) []const u8 { return self.cwd[0..self.cwd_len]; }
    pub fn arg(self: *const Launch, index: usize) []const u8 { return self.argv[index][0..self.argv_lens[index]]; }
};

pub const Client = struct {
    state: Connection = .disconnected,
    sequence: u64 = 0,
    revision: u64 = 0,
    attempt: u8 = 0,
    cancelled: bool = false,
    authorization: []const u8,
    pub fn init(token: []const u8) Client { return .{ .authorization = token }; }
    pub fn begin(self: *Client) void { self.state = .discovering; self.cancelled = false; }
    pub fn shutdown(self: *Client) void { self.cancelled = true; self.state = .shutting_down; }
    pub fn backoffMs(self: *Client) u64 { const shift: u6 = @intCast(@min(self.attempt, 6)); self.attempt +|= 1; return @min(@as(u64, 250) << shift, 10_000); }
    fn request(self: *Client, method: Method, path: []const u8, body: []const u8) !Request {
        if (self.cancelled) return error.Cancelled;
        if (!std.mem.startsWith(u8, self.authorization, "Bearer ") or self.authorization.len <= 7) return error.MissingCredential;
        return .{ .method = method, .path = path, .authorization = self.authorization, .body = body };
    }
    pub fn discoveryRequest(self: *Client) !Request { return self.request(.GET, "/v1", ""); }
    pub fn aggregateSnapshotRequest(self: *Client) !Request { return self.request(.GET, "/v1/snapshot", ""); }
    pub fn snapshotRequest(self: *Client, workspace_id: []const u8, path: *[80]u8) !Request {
        if (!uuid(workspace_id)) return error.InvalidIdentity;
        const value = try std.fmt.bufPrint(path, "/v1/workspaces/{s}", .{workspace_id});
        return self.request(.GET, value, "");
    }
    pub fn eventsRequest(self: *Client, cursor_buf: *[20]u8) !Request {
        const cursor = try std.fmt.bufPrint(cursor_buf, "{d}", .{self.sequence});
        var req = try self.request(.GET, "/v1/events", ""); req.last_event_id = cursor; return req;
    }
    pub fn launchRequestAlloc(self: *Client, allocator: std.mem.Allocator, workspace_id: []const u8, repository_id: []const u8, command_id: ?[]const u8) !Request {
        if (!uuid(workspace_id) or !uuid(repository_id)) return error.InvalidIdentity;
        if (command_id) |id| if (!prefixed(id, "cmd_")) return error.InvalidIdentity;
        const body = if (command_id) |id| try std.fmt.allocPrint(allocator, "{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\",\"command_id\":\"{s}\",\"expected_revision\":\"{d}\"}}", .{workspace_id,repository_id,id,self.revision}) else try std.fmt.allocPrint(allocator, "{{\"workspace_id\":\"{s}\",\"repository_id\":\"{s}\",\"expected_revision\":\"{d}\"}}", .{workspace_id,repository_id,self.revision});
        return self.request(.POST, "/v1/native-launch", body);
    }
    pub fn acceptDiscovery(self: *Client, status: u16, body: []const u8) !Outcome {
        if (self.cancelled) return error.Cancelled;
        if (status == 401 or status == 403) { self.state = .failed; return .{ .failure = "unauthorized" }; }
        if (status != 200 or !validDiscovery(body)) { self.state = .incompatible; return .incompatible; }
        self.state = .snapshot_loading; return .none;
    }
    pub fn acceptSnapshotJson(self: *Client, status: u16, body: []const u8) Outcome {
        if (status != 200) return .{ .failure = "snapshot_transport" };
        const decoded = decodeSnapshot(body) catch { self.state = .failed; return .{ .failure = "invalid_snapshot" }; };
        self.revision = decoded.revision; self.sequence = decoded.sequence; self.state = .replaying; return .{ .snapshot = decoded };
    }
    pub fn acceptSnapshot(self: *Client, revision: u64, sequence: u64) Outcome { self.revision=revision; self.sequence=sequence; self.state=.replaying; return .{.snapshot=.{.revision=revision,.sequence=sequence,.workspace_id=undefined}}; }
    pub fn acceptEvent(self: *Client, sequence: u64) Outcome { return self.order(.{ .sequence=sequence, .kind=.heartbeat }); }
    fn order(self: *Client, event: Event) Outcome { if (event.sequence <= self.sequence) return .duplicate; if (event.sequence != self.sequence + 1) { self.state=.refresh_required; return .gap_refresh; } self.sequence=event.sequence; self.state=.ready; self.attempt=0; return .{.event=event}; }
    pub fn acceptSse(self: *Client, frame: []const u8) Outcome {
        var id: ?u64 = null; var data: ?[]const u8 = null;
        var lines = std.mem.splitScalar(u8, frame, '\n');
        while (lines.next()) |raw| { const line=std.mem.trimRight(u8,raw,"\r"); if (std.mem.startsWith(u8,line,"id:")) id=std.fmt.parseInt(u64,std.mem.trim(u8,line[3..]," "),10) catch null else if (std.mem.startsWith(u8,line,"data:")) data=std.mem.trim(u8,line[5..]," "); }
        const seq=id orelse return .{.failure="invalid_sse"}; const value=data orelse return .{.failure="invalid_sse"};
        const event=decodeEvent(seq,value) catch return .{.failure="invalid_event"}; return self.order(event);
    }
    pub fn resolveLaunch(self: *Client, status: u16, body: []const u8) !Outcome { if (self.cancelled) return error.Cancelled; if(status!=200)return .{.failure="transport"}; return .{.launch=decodeLaunch(body) catch return .{.failure="invalid_payload"}}; }
};

fn exactKeys(object: std.json.ObjectMap, expected: []const []const u8) bool { if(object.count()!=expected.len)return false; for(object.keys())|k| { var found=false; for(expected)|e| if(std.mem.eql(u8,k,e)){found=true;break;}; if(!found)return false; } return true; }
fn string(o: std.json.ObjectMap, key: []const u8) ?[]const u8 { const v=o.get(key) orelse return null; return if(v==.string)v.string else null; }
fn uintString(o: std.json.ObjectMap,key:[]const u8) ?u64 { return std.fmt.parseInt(u64,string(o,key) orelse return null,10) catch null; }
fn prefixed(v:[]const u8,p:[]const u8)bool{return std.mem.startsWith(u8,v,p) and v.len>=p.len+16;}
fn uuid(v:[]const u8)bool{return v.len==36 and v[8]=='-' and v[13]=='-' and v[18]=='-' and v[23]=='-';}
fn validDiscovery(body:[]const u8)bool { const p=std.json.parseFromSlice(std.json.Value,std.heap.page_allocator,body,.{}) catch return false; defer p.deinit(); if(p.value!=.object or !exactKeys(p.value.object,&.{"protocol","request_id","ok","data"}))return false; const o=p.value.object; if(!std.mem.eql(u8,string(o,"protocol") orelse return false,"v1") or !prefixed(string(o,"request_id") orelse return false,"req_") or o.get("ok").? != .bool or !o.get("ok").?.bool)return false; const d=o.get("data").?; if(d!=.object or !exactKeys(d.object,&.{"service_version","capabilities","limits"}) or (string(d.object,"service_version") orelse "").len==0)return false; const caps=d.object.get("capabilities") orelse return false; const limits=d.object.get("limits") orelse return false; return caps==.object and caps.object.count()==5 and limits==.object and limits.object.count()==3; }
fn decodeSnapshot(body:[]const u8)!Snapshot { const p=try std.json.parseFromSlice(std.json.Value,std.heap.page_allocator,body,.{}); defer p.deinit(); if(p.value!=.object)return error.Invalid; const o=p.value.object; if(!exactKeys(o,&.{"protocol","request_id","ok","revision","generated_at","workspace"}))return error.Invalid; if(!std.mem.eql(u8,string(o,"protocol") orelse return error.Invalid,"v1") or o.get("ok").?!=.bool or !o.get("ok").?.bool)return error.Invalid; const ws=o.get("workspace") orelse return error.Invalid; if(ws!=.object)return error.Invalid; const id=string(ws.object,"id") orelse return error.Invalid; if(!uuid(id))return error.Invalid; var result=Snapshot{.revision=uintString(o,"revision") orelse return error.Invalid,.sequence=0,.workspace_id=undefined}; @memcpy(&result.workspace_id,id); return result; }
fn decodeEvent(sse_id:u64,body:[]const u8)!Event { const p=try std.json.parseFromSlice(std.json.Value,std.heap.page_allocator,body,.{}); defer p.deinit(); if(p.value!=.object)return error.Invalid; const o=p.value.object; const seq=uintString(o,"sequence") orelse return error.Invalid; if(seq!=sse_id or !std.mem.eql(u8,string(o,"protocol") orelse return error.Invalid,"v1"))return error.Invalid; const typ=string(o,"type") orelse return error.Invalid; if(std.mem.eql(u8,typ,"attention")){if(o.get("attention")==null)return error.Invalid;return .{.sequence=seq,.kind=.attention};} if(std.mem.eql(u8,typ,"operation")){if(o.get("operation")==null)return error.Invalid;return .{.sequence=seq,.kind=.operation};} if(std.mem.eql(u8,typ,"control")){const c=o.get("control") orelse return error.Invalid;if(c!=.object)return error.Invalid;const k=string(c.object,"kind") orelse return error.Invalid;if(std.mem.eql(u8,k,"replay_gap"))return error.ReplayGap;if(!std.mem.eql(u8,k,"heartbeat"))return error.Invalid;return .{.sequence=seq,.kind=.heartbeat};} return error.Invalid; }
fn decodeLaunch(body:[]const u8)!Launch { const p=try std.json.parseFromSlice(std.json.Value,std.heap.page_allocator,body,.{}); defer p.deinit(); if(p.value!=.object)return error.Invalid; const root=p.value.object; const wrapped=root.get("data"); const o=if(wrapped)|v| blk:{if(!exactKeys(root,&.{"protocol","request_id","ok","data"}) or v!=.object)return error.Invalid;break :blk v.object;} else root; const resolved=o.get("resolved") orelse return error.Invalid; if(resolved!=.bool or !resolved.bool)return error.ResolutionFailed; if(!exactKeys(o,&.{"resolved","revision","launch"}))return error.Invalid; const l=o.get("launch").?; if(l!=.object or !exactKeys(l.object,&.{"argv","cwd","environment","ports","configuration","redacted"}))return error.Invalid; const av=l.object.get("argv").?; const cwd=string(l.object,"cwd") orelse return error.Invalid; if(av!=.array or av.array.items.len==0 or av.array.items.len>32 or cwd.len==0 or cwd.len>512)return error.Invalid; var out:Launch=.{.revision=uintString(o,"revision") orelse return error.Invalid,.cwd_len=@intCast(cwd.len)}; @memcpy(out.cwd[0..cwd.len],cwd); for(av.array.items,0..) |v,i| {if(v!=.string or v.string.len==0 or v.string.len>256)return error.Invalid;@memcpy(out.argv[i][0..v.string.len],v.string);out.argv_lens[i]=@intCast(v.string.len);} out.argv_count=@intCast(av.array.items.len); const env=l.object.get("environment").?; const ports=l.object.get("ports").?; const red=l.object.get("redacted").?; const cfg=l.object.get("configuration").?; if(env!=.object or ports!=.object or red!=.array or cfg!=.object or !exactKeys(cfg.object,&.{"shell"}) and !exactKeys(cfg.object,&.{"command_id","shell"}))return error.Invalid; const shell=cfg.object.get("shell").?; if(shell!=.bool)return error.Invalid; out.shell=shell.bool; out.environment_count=@intCast(env.object.count());out.port_count=@intCast(ports.object.count());out.redacted_count=@intCast(red.array.items.len);return out; }

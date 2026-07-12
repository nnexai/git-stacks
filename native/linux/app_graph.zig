const std = @import("std");
const service_client = @import("service_client");
const tab_registry = @import("tab_registry");
const model = @import("model");
const reducer = @import("reducer");

pub const ProductionGraph = struct {
    allocator: std.mem.Allocator,
    authorization: []u8,
    endpoint: []u8,
    service: service_client.Client,
    transport: service_client.HttpTransport,
    terminals: tab_registry.Registry,
    state: model.State = .{},

    pub fn init(allocator: std.mem.Allocator, token: ?[]const u8) !ProductionGraph {
        const authorization = if (token) |value|
            try std.fmt.allocPrint(allocator, "Bearer {s}", .{value})
        else
            try allocator.dupe(u8, "");
        errdefer allocator.free(authorization);

        var graph: ProductionGraph = .{
            .allocator = allocator,
            .authorization = authorization,
            .endpoint = try allocator.dupe(u8, ""),
            .service = service_client.Client.init(authorization),
            .transport = service_client.HttpTransport.init(allocator),
            .terminals = tab_registry.Registry.init(allocator),
        };
        if (token != null) graph.service.begin();
        return graph;
    }

    pub fn initFromEnvironment(allocator: std.mem.Allocator) !ProductionGraph {
        if (std.posix.getenv("GIT_STACKS_SERVICE_TOKEN")) |token| return init(allocator, token);
        const config = std.posix.getenv("GIT_STACKS_CONFIG_DIR") orelse blk: {
            const home = std.posix.getenv("HOME") orelse return init(allocator, null);
            break :blk try std.fmt.allocPrint(allocator, "{s}/.config/git-stacks", .{home});
        };
        defer if (std.posix.getenv("GIT_STACKS_CONFIG_DIR") == null) allocator.free(config);
        const root = try std.fmt.allocPrint(allocator, "{s}/service", .{config});
        defer allocator.free(root);
        const access = service_client.discoverAccess(root) catch |err| switch (err) {
            error.FileNotFound => return init(allocator, null),
            else => return err,
        };
        var graph = try init(allocator, null);
        allocator.free(graph.authorization);
        allocator.free(graph.endpoint);
        graph.authorization = try allocator.dupe(u8, access.authorizationSlice());
        graph.endpoint = try allocator.dupe(u8, access.endpointSlice());
        graph.service = service_client.Client.init(graph.authorization);
        graph.service.begin();
        try graph.synchronizeDiscovery();
        try graph.refreshSnapshot();
        return graph;
    }
    pub fn refreshSnapshot(self: *ProductionGraph) !void {
        const request = try self.service.aggregateSnapshotRequest();
        const response = try self.transport.execute(self.endpoint, request);
        defer response.deinit(self.allocator);
        if (response.status != 200) return error.SnapshotRejected;
        const action = try self.service.decodeAggregateSnapshot(response.body);
        const authoritative = reducer.reduce(self.state, action).state;
        try self.applyAuthoritativeSnapshot(authoritative);
    }
    pub fn applyAuthoritativeSnapshot(self: *ProductionGraph, authoritative: model.State) !void {
        const previous = self.state;
        self.state = authoritative;
        // Service snapshots own workspace/repository/command truth. Native
        // presentation (pins, selection and terminal history) is reconciled
        // by stable identities instead of being erased by every refresh.
        for (previous.pins[0..previous.pin_count]) |id| if (model.workspaceValid(&self.state, id) and self.state.pin_count < self.state.pins.len) {
            self.state.pins[self.state.pin_count] = id;
            self.state.pin_count += 1;
        };
        for (previous.pairs[0..previous.pair_count]) |old_pair| if (model.pairIndex(&self.state, old_pair.key)) |index| {
            self.state.pairs[index].surface_count = old_pair.surface_count;
            @memcpy(self.state.pairs[index].surfaces[0..old_pair.surface_count], old_pair.surfaces[0..old_pair.surface_count]);
        } else if (self.terminals.hasLivePair(old_pair.key)) {
            if (self.state.orphan_tombstone_count >= self.state.orphan_tombstones.len) return error.OrphanCapacity;
            const index = self.state.orphan_tombstone_count;
            var tombstone: model.OrphanPairTombstone = .{ .key = old_pair.key, .surfaces = undefined, .surface_count = old_pair.surface_count };
            @memcpy(tombstone.surfaces[0..old_pair.surface_count], old_pair.surfaces[0..old_pair.surface_count]);
            for (previous.workspaces[0..previous.workspace_count]) |workspace| if (std.mem.eql(u8, &workspace.id, &old_pair.key.workspace_id)) {
                tombstone.workspace_name_len = workspace.name_len;
                @memcpy(tombstone.workspace_name[0..workspace.name_len], workspace.name[0..workspace.name_len]);
                for (workspace.repositories[0..workspace.repository_count]) |repository| if (std.mem.eql(u8, &repository.id, &old_pair.key.repository_id)) {
                    tombstone.repository_name_len = repository.name_len;
                    @memcpy(tombstone.repository_name[0..repository.name_len], repository.name[0..repository.name_len]);
                    break;
                };
                break;
            };
            self.state.orphan_tombstones[index] = tombstone;
            self.state.orphan_tombstone_count += 1;
        };
        for (previous.orphan_tombstones[0..previous.orphan_tombstone_count]) |old| if (self.terminals.hasLivePair(old.key) and model.pairIndex(&self.state, old.key) == null and model.orphanIndex(&self.state, old.key) == null) {
            if (self.state.orphan_tombstone_count >= self.state.orphan_tombstones.len) return error.OrphanCapacity;
            self.state.orphan_tombstones[self.state.orphan_tombstone_count] = old;
            self.state.orphan_tombstone_count += 1;
        };
        if (previous.selected_pair) |pair| {
            if (model.pairOrOrphanValid(&self.state, pair)) self.state.selected_pair = pair;
        }
        if (previous.last_pair) |pair| {
            if (model.pairOrOrphanValid(&self.state, pair)) self.state.last_pair = pair;
        }
        if (previous.surface) |surface| {
            if (model.surfaceLocation(&self.state, surface.id) != null) self.state.surface = surface;
        }
        self.state.organization_mode = previous.organization_mode;
        for (previous.attention[0..previous.attention_count]) |old| {
            var found = false;
            for (self.state.attention[0..self.state.attention_count]) |*item| if (old.service_id_len > 0 and item.service_id_len == old.service_id_len and std.mem.eql(u8, old.service_id[0..old.service_id_len], item.service_id[0..item.service_id_len])) {
                item.read = old.read;
                found = true;
                break;
            };
            // OSC lifecycle events are observed by the native PTY and do not
            // exist in the service snapshot. Keep them across unrelated
            // refreshes while their exact surface is still retained. A later
            // unified signal transport can remove this reconciliation without
            // changing the reducer or presentation model.
            const local_osc = old.service_id_len >= 4 and std.mem.eql(u8, old.service_id[0..4], "osc:");
            const surface_retained = if (old.surface_id) |sid| model.surfaceLocation(&self.state, sid) != null else false;
            if (!found and local_osc and surface_retained and self.state.attention_count < self.state.attention.len) {
                self.state.attention[self.state.attention_count] = old;
                self.state.attention_count += 1;
            }
        }
    }
    pub fn releaseOrphanIfEnded(self: *ProductionGraph, key: model.PairKey) void {
        if (self.terminals.hasLivePair(key)) return;
        var write: usize = 0;
        for (self.state.orphan_tombstones[0..self.state.orphan_tombstone_count]) |entry| if (!model.PairKey.eql(entry.key, key)) {
            self.state.orphan_tombstones[write] = entry;
            write += 1;
        };
        self.state.orphan_tombstone_count = @intCast(write);
    }
    pub fn replayOnce(self: *ProductionGraph) !void {
        var cursor: [20]u8 = undefined;
        const request = try self.service.eventsRequest(&cursor);
        const response = try self.transport.execute(self.endpoint, request);
        defer response.deinit(self.allocator);
        if (response.status != 200) return error.EventStreamRejected;
        var frames = std.mem.splitSequence(u8, response.body, "\n\n");
        while (frames.next()) |frame| {
            if (frame.len == 0) continue;
            const action = self.service.decodeSseReducerAction(frame) catch |err| switch (err) {
                error.Duplicate => continue,
                error.ReplayGap => {
                    try self.refreshSnapshot();
                    return;
                },
                else => return err,
            };
            self.state = reducer.reduce(self.state, action).state;
        }
    }

    pub fn resolveLaunch(self: *ProductionGraph, pair: model.PairKey, command_id: ?[]const u8) !service_client.Launch {
        for (0..2) |attempt| {
            var workspace_revision: ?u64 = null;
            for (self.state.workspaces[0..self.state.workspace_count]) |workspace| if (std.mem.eql(u8, &workspace.id, &pair.workspace_id)) {
                workspace_revision = workspace.revision;
                break;
            };
            const request = try self.service.launchRequestAlloc(self.allocator, &pair.workspace_id, &pair.repository_id, command_id, workspace_revision orelse return error.UnknownWorkspace);
            defer self.allocator.free(request.body);
            const response = try self.transport.execute(self.endpoint, request);
            defer response.deinit(self.allocator);
            const outcome = try self.service.resolveLaunch(response.status, response.body);
            switch (outcome) {
                .launch => |launch| return launch,
                .failure => |reason| {
                    if (response.status == 200 and std.mem.eql(u8, reason, "invalid_payload")) return error.InvalidLaunchResponse;
                    if (attempt == 0 and std.mem.indexOf(u8, response.body, "\"code\":\"conflict\"") != null) {
                        try self.refreshSnapshot();
                        continue;
                    }
                    if (std.mem.indexOf(u8, response.body, "\"code\":\"not_found\"") != null) return error.LaunchTargetNotFound;
                    if (std.mem.indexOf(u8, response.body, "\"code\":\"operation_failed\"") != null) return error.LaunchOperationFailed;
                    std.debug.print("native launch service rejected request (HTTP {d}): {s}\n", .{ response.status, response.body });
                    return error.LaunchRejected;
                },
                else => return error.InvalidLaunchResponse,
            }
        }
        return error.LaunchConflict;
    }

    pub fn synchronizeDiscovery(self: *ProductionGraph) !void {
        const request = try self.service.discoveryRequest();
        const response = try self.transport.execute(self.endpoint, request);
        defer response.deinit(self.allocator);
        _ = try self.service.acceptDiscovery(response.status, response.body);
        if (self.service.state == .incompatible or self.service.state == .failed) return error.ServiceRejected;
    }

    pub fn deinit(self: *ProductionGraph) void {
        self.service.shutdown();
        self.transport.cancel();
        self.transport.deinit();
        self.terminals.deinit();
        self.allocator.free(self.endpoint);
        self.allocator.free(self.authorization);
        self.authorization = undefined;
    }

    pub fn assertWired(self: *ProductionGraph) !void {
        if (self.service.authorization.ptr != self.authorization.ptr) return error.DetachedServiceCredential;
        if (self.terminals.allocator.ptr != self.allocator.ptr) return error.DetachedTerminalRegistry;
        if (self.authorization.len == 0) {
            if (self.service.state != .disconnected) return error.InvalidAnonymousServiceState;
        } else switch (self.service.state) {
            .discovering, .snapshot_loading, .replaying, .ready, .refresh_required => {},
            else => return error.ServiceNotStarted,
        }
    }

    pub fn terminalRegistry(self: *ProductionGraph) *tab_registry.Registry {
        return &self.terminals;
    }
};

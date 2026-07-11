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
        const root = try std.fmt.allocPrint(allocator, "{s}/service", .{config}); defer allocator.free(root);
        const access = service_client.discoverAccess(root) catch |err| switch(err){error.FileNotFound=>return init(allocator,null),else=>return err};
        var graph = try init(allocator, null);
        allocator.free(graph.authorization); allocator.free(graph.endpoint);
        graph.authorization = try allocator.dupe(u8,access.authorizationSlice());
        graph.endpoint = try allocator.dupe(u8,access.endpointSlice());
        graph.service = service_client.Client.init(graph.authorization); graph.service.begin();
        try graph.synchronizeDiscovery();
        try graph.refreshSnapshot();
        return graph;
    }
    pub fn refreshSnapshot(self:*ProductionGraph)!void {
        const request=try self.service.aggregateSnapshotRequest();
        const response=try self.transport.execute(self.endpoint,request);defer response.deinit(self.allocator);
        if(response.status!=200)return error.SnapshotRejected;
        const action=try self.service.decodeAggregateSnapshot(response.body);
        self.state=reducer.reduce(self.state,action).state;
    }

    pub fn synchronizeDiscovery(self:*ProductionGraph)!void {
        const request=try self.service.discoveryRequest();
        const response=try self.transport.execute(self.endpoint,request);defer response.deinit(self.allocator);
        _=try self.service.acceptDiscovery(response.status,response.body);
        if(self.service.state==.incompatible or self.service.state==.failed)return error.ServiceRejected;
    }

    pub fn deinit(self: *ProductionGraph) void {
        self.service.shutdown();
        self.transport.cancel(); self.transport.deinit();
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
        } else if (self.service.state != .discovering and self.service.state != .snapshot_loading) return error.ServiceNotStarted;
    }

    pub fn terminalRegistry(self: *ProductionGraph) *tab_registry.Registry {
        return &self.terminals;
    }
};

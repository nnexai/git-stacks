const std = @import("std");
const service_client = @import("service_client");
const tab_registry = @import("tab_registry");

pub const ProductionGraph = struct {
    allocator: std.mem.Allocator,
    authorization: []u8,
    service: service_client.Client,
    terminals: tab_registry.Registry,

    pub fn init(allocator: std.mem.Allocator, token: ?[]const u8) !ProductionGraph {
        const authorization = if (token) |value|
            try std.fmt.allocPrint(allocator, "Bearer {s}", .{value})
        else
            try allocator.dupe(u8, "");
        errdefer allocator.free(authorization);

        var graph: ProductionGraph = .{
            .allocator = allocator,
            .authorization = authorization,
            .service = service_client.Client.init(authorization),
            .terminals = tab_registry.Registry.init(allocator),
        };
        if (token != null) graph.service.begin();
        return graph;
    }

    pub fn initFromEnvironment(allocator: std.mem.Allocator) !ProductionGraph {
        return init(allocator, std.posix.getenv("GIT_STACKS_SERVICE_TOKEN"));
    }

    pub fn deinit(self: *ProductionGraph) void {
        self.service.shutdown();
        self.terminals.deinit();
        self.allocator.free(self.authorization);
        self.authorization = undefined;
    }

    pub fn assertWired(self: *ProductionGraph) !void {
        if (self.service.authorization.ptr != self.authorization.ptr) return error.DetachedServiceCredential;
        if (self.terminals.allocator.ptr != self.allocator.ptr) return error.DetachedTerminalRegistry;
        if (self.authorization.len == 0) {
            if (self.service.state != .disconnected) return error.InvalidAnonymousServiceState;
        } else if (self.service.state != .discovering) return error.ServiceNotStarted;
    }

    pub fn terminalRegistry(self: *ProductionGraph) *tab_registry.Registry {
        return &self.terminals;
    }
};

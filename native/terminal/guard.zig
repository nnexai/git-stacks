const std = @import("std");

pub const Registration = extern struct { pid: i32, pgid: i32, birth_token: u64 };

pub const Registry = struct {
    allocator: std.mem.Allocator,
    client_pgid: i32,
    guard_pgid: i32,
    entries: std.ArrayList(Registration) = .empty,

    pub fn init(allocator: std.mem.Allocator, client_pgid: i32, guard_pgid: i32) Registry {
        return .{ .allocator = allocator, .client_pgid = client_pgid, .guard_pgid = guard_pgid };
    }
    pub fn deinit(self: *Registry) void {
        self.entries.deinit(self.allocator);
    }

    pub fn register(self: *Registry, registration: Registration) !void {
        const pid = registration.pid;
        const pgid = registration.pgid;
        const birth_token = registration.birth_token;
        if (pid <= 1 or pgid <= 1 or birth_token == 0) return error.UnsafeIdentity;
        if (pgid == self.client_pgid or pgid == self.guard_pgid) return error.UnsafeProcessGroup;
        for (self.entries.items) |entry| {
            if (entry.pgid == pgid and entry.birth_token == birth_token) return;
            if (entry.pgid == pgid) return error.BirthTokenMismatch;
        }
        try self.entries.append(self.allocator, registration);
    }

    pub fn unregister(self: *Registry, registration: Registration) !void {
        for (self.entries.items, 0..) |entry, index| {
            if (std.meta.eql(entry, registration)) {
                _ = self.entries.swapRemove(index);
                return;
            }
        }
        return error.UnknownRegistration;
    }

    /// Called only when the inherited private control channel reaches EOF.
    pub fn controlEof(self: *Registry, backend: anytype) !void {
        var index = self.entries.items.len;
        while (index > 0) {
            index -= 1;
            const entry = self.entries.items[index];
            // Failed cleanup remains registered: losing the record would turn
            // uncertainty into a false absence claim.
            if (try backend.cleanup(entry)) _ = self.entries.swapRemove(index);
        }
    }
};

pub const TestBackend = struct {
    cleaned: std.ArrayList(Registration) = .empty,
    pub fn init() TestBackend {
        return .{};
    }
    pub fn deinit(self: *TestBackend) void {
        self.cleaned.deinit(std.testing.allocator);
    }
    pub fn cleanup(self: *TestBackend, registration: Registration) !bool {
        try self.cleaned.append(std.testing.allocator, registration);
        return true;
    }
};

pub const Opcode = enum(u8) { register = 1, unregister = 2 };
pub const Frame = extern struct { opcode: Opcode, registration: Registration };

/// The guard accepts binary frames from its inherited descriptor only. There
/// is deliberately no filesystem path, socket name, argv command, or parser.
pub fn applyPrivateFrame(registry: *Registry, frame: Frame) !void {
    switch (frame.opcode) {
        .register => try registry.register(frame.registration),
        .unregister => try registry.unregister(frame.registration),
    }
}

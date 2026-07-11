const std = @import("std");

pub const Registration = struct { pgid: i32, birth_token: u64 };

pub const Registry = struct {
    allocator: std.mem.Allocator,
    client_pgid: i32,
    guard_pgid: i32,
    entries: std.ArrayList(Registration) = .empty,

    pub fn init(allocator: std.mem.Allocator, client_pgid: i32, guard_pgid: i32) Registry {
        return .{ .allocator = allocator, .client_pgid = client_pgid, .guard_pgid = guard_pgid };
    }
    pub fn deinit(self: *Registry) void { self.entries.deinit(self.allocator); }

    pub fn register(self: *Registry, pgid: i32, birth_token: u64) !void {
        if (pgid <= 1 or pgid == self.client_pgid or pgid == self.guard_pgid) return error.UnsafeProcessGroup;
        for (self.entries.items) |entry| {
            if (entry.pgid == pgid and entry.birth_token == birth_token) return;
            if (entry.pgid == pgid) return error.BirthTokenMismatch;
        }
        try self.entries.append(self.allocator, .{ .pgid = pgid, .birth_token = birth_token });
    }

    pub fn unregister(self: *Registry, pgid: i32, birth_token: u64) !void {
        for (self.entries.items, 0..) |entry, index| {
            if (entry.pgid == pgid and entry.birth_token == birth_token) {
                _ = self.entries.swapRemove(index);
                return;
            }
        }
        return error.UnknownRegistration;
    }

    /// Called only when the inherited private control channel reaches EOF.
    pub fn controlEof(self: *Registry, backend: anytype) !void {
        for (self.entries.items) |entry| try backend.cleanup(entry.pgid, entry.birth_token);
        self.entries.clearRetainingCapacity();
    }
};

pub const TestBackend = struct {
    cleaned: std.ArrayList(Registration) = .empty,
    pub fn init() TestBackend { return .{}; }
    pub fn deinit(self: *TestBackend) void { self.cleaned.deinit(std.testing.allocator); }
    pub fn cleanup(self: *TestBackend, pgid: i32, birth_token: u64) !void {
        try self.cleaned.append(std.testing.allocator, .{ .pgid = pgid, .birth_token = birth_token });
    }
};

pub const Opcode = enum(u8) { register = 1, unregister = 2 };
pub const Frame = extern struct { opcode: Opcode, pgid: i32, birth_token: u64 };

/// The guard accepts binary frames from its inherited descriptor only. There
/// is deliberately no filesystem path, socket name, argv command, or parser.
pub fn applyPrivateFrame(registry: *Registry, frame: Frame) !void {
    switch (frame.opcode) {
        .register => try registry.register(frame.pgid, frame.birth_token),
        .unregister => try registry.unregister(frame.pgid, frame.birth_token),
    }
}

const std = @import("std");
const posix = std.posix;
const c = @cImport({
    @cInclude("signal.h");
    @cInclude("unistd.h");
});

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

/// Sibling-process EOF backend. It cannot call through a Ghostty surface after
/// the host address space has died, so it revalidates the exact identity that
/// Ghostty supplied at registration and controls only that process group.
pub const LinuxCleanupBackend = struct {
    pub fn cleanup(_: *LinuxCleanupBackend, registration: Registration) !bool {
        if (!identityMatches(registration)) return false;
        inline for (.{ @as(u8, c.SIGHUP), @as(u8, c.SIGTERM), @as(u8, c.SIGKILL) }, .{ @as(u64, 500), @as(u64, 2000), @as(u64, 0) }) |signal, delay| {
            posix.kill(-registration.pgid, signal) catch |err| switch (err) {
                error.ProcessNotFound => return true,
                else => return err,
            };
            if (delay != 0) std.Thread.sleep(delay * std.time.ns_per_ms);
            if (groupAbsent(registration.pgid)) return true;
        }
        return groupAbsent(registration.pgid);
    }

    fn identityMatches(registration: Registration) bool {
        return linuxBirthToken(registration.pid) == registration.birth_token and
            c.getpgid(registration.pid) == registration.pgid;
    }

    fn groupAbsent(pgid: i32) bool {
        posix.kill(-pgid, 0) catch |err| return err == error.ProcessNotFound;
        var proc = std.fs.openDirAbsolute("/proc", .{ .iterate = true }) catch return false;
        defer proc.close();
        var iterator = proc.iterate();
        while (iterator.next() catch return false) |entry| {
            if (entry.kind != .directory) continue;
            const pid = std.fmt.parseInt(i32, entry.name, 10) catch continue;
            const status = linuxProcessStatus(pid) orelse continue;
            if (status.pgid == pgid and status.state != 'Z') return false;
        }
        return true;
    }
};

pub fn linuxBirthToken(pid: i32) ?u64 {
    var path_buffer: [64]u8 = undefined;
    const path = std.fmt.bufPrint(&path_buffer, "/proc/{d}/stat", .{pid}) catch return null;
    const file = std.fs.openFileAbsolute(path, .{}) catch return null;
    defer file.close();
    var buffer: [4096]u8 = undefined;
    const length = file.readAll(&buffer) catch return null;
    const close_paren = std.mem.lastIndexOfScalar(u8, buffer[0..length], ')') orelse return null;
    var fields = std.mem.tokenizeScalar(u8, buffer[close_paren + 1 .. length], ' ');
    var index: usize = 3;
    while (fields.next()) |field| : (index += 1) {
        if (index == 22) return std.fmt.parseUnsigned(u64, field, 10) catch null;
    }
    return null;
}

const ProcessStatus = struct { state: u8, pgid: i32 };

fn linuxProcessStatus(pid: i32) ?ProcessStatus {
    var path_buffer: [64]u8 = undefined;
    const path = std.fmt.bufPrint(&path_buffer, "/proc/{d}/stat", .{pid}) catch return null;
    const file = std.fs.openFileAbsolute(path, .{}) catch return null;
    defer file.close();
    var buffer: [4096]u8 = undefined;
    const length = file.readAll(&buffer) catch return null;
    const close_paren = std.mem.lastIndexOfScalar(u8, buffer[0..length], ')') orelse return null;
    var fields = std.mem.tokenizeScalar(u8, buffer[close_paren + 1 .. length], ' ');
    const state = (fields.next() orelse return null)[0];
    _ = fields.next() orelse return null; // parent PID
    const pgid = std.fmt.parseInt(i32, fields.next() orelse return null, 10) catch return null;
    return .{ .state = state, .pgid = pgid };
}

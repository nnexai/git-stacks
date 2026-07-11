const std = @import("std");

pub const Lifecycle = enum { acquiring, live, closing, ended, failed_cleanup };
pub const Activity = enum { idle_shell, foreground_activity };
pub const Signal = enum { hup, term, kill };

pub const Owner = struct {
    surface_key: u64,
    child_pid: i32,
    pgid: i32,
    birth_token: u64,
    lifecycle: Lifecycle = .acquiring,
    registered: bool = false,

    pub fn init(surface_key: u64, child_pid: i32, pgid: i32, birth_token: u64) Owner {
        return .{ .surface_key = surface_key, .child_pid = child_pid, .pgid = pgid, .birth_token = birth_token };
    }

    pub fn exposeLive(self: *Owner, backend: anytype, client_pgid: i32, guard_pgid: i32) !void {
        if (self.lifecycle != .acquiring) return error.InvalidLifecycle;
        if (self.surface_key == 0 or self.child_pid <= 1 or self.pgid <= 1 or self.birth_token == 0) return error.IncompleteOwnership;
        if (self.pgid == client_pgid or self.pgid == guard_pgid) return error.UnsafeProcessGroup;
        if (!try backend.birthTokenMatches(self.child_pid, self.birth_token)) return error.BirthTokenMismatch;
        try backend.register(self.pgid, self.birth_token);
        self.registered = true;
        self.lifecycle = .live;
    }

    pub fn needsConfirmation(self: Owner, activity: Activity) bool {
        return self.lifecycle == .live and activity == .foreground_activity;
    }

    pub fn childExited(self: *Owner, backend: anytype) !void {
        if (self.lifecycle == .ended or self.lifecycle == .failed_cleanup) return;
        try self.finishIfAbsent(backend);
    }

    pub fn close(self: *Owner, backend: anytype) !void {
        if (self.lifecycle == .ended or self.lifecycle == .failed_cleanup) return;
        self.lifecycle = .closing;
        try backend.requestGraceful(self.child_pid);
        try backend.sleepMs(2000);
        if (!try backend.isAbsent(self.pgid, self.birth_token)) {
            inline for (.{ Signal.hup, Signal.term, Signal.kill }, .{ @as(u64, 500), @as(u64, 2000), @as(u64, 0) }) |signal, delay| {
                try backend.signalGroup(self.pgid, signal);
                if (delay != 0) try backend.sleepMs(delay);
                if (try backend.isAbsent(self.pgid, self.birth_token)) break;
            }
        }
        try self.finishIfAbsent(backend);
    }

    pub fn quit(self: *Owner, backend: anytype) !void { try self.close(backend); }

    fn finishIfAbsent(self: *Owner, backend: anytype) !void {
        if (try backend.isAbsent(self.pgid, self.birth_token)) {
            try backend.reap(self.child_pid);
            if (self.registered) try backend.unregister(self.pgid, self.birth_token);
            self.registered = false;
            self.lifecycle = .ended;
        } else self.lifecycle = .failed_cleanup;
    }
};

pub const TestBackend = struct {
    signals: std.ArrayList(Signal) = .empty,
    sleeps: std.ArrayList(u64) = .empty,
    prove_absent: bool = true,
    registered: bool = false,
    pub fn init() TestBackend { return .{}; }
    pub fn deinit(self: *TestBackend) void { self.signals.deinit(std.testing.allocator); self.sleeps.deinit(std.testing.allocator); }
    pub fn birthTokenMatches(_: *TestBackend, _: i32, _: u64) !bool { return true; }
    pub fn register(self: *TestBackend, _: i32, _: u64) !void { self.registered = true; }
    pub fn unregister(self: *TestBackend, _: i32, _: u64) !void { self.registered = false; }
    pub fn requestGraceful(_: *TestBackend, _: i32) !void {}
    pub fn sleepMs(self: *TestBackend, duration: u64) !void { try self.sleeps.append(std.testing.allocator, duration); }
    pub fn signalGroup(self: *TestBackend, _: i32, signal: Signal) !void { try self.signals.append(std.testing.allocator, signal); }
    pub fn isAbsent(self: *TestBackend, _: i32, _: u64) !bool {
        if (self.prove_absent and self.signals.items.len >= 3) return true;
        return false;
    }
    pub fn reap(_: *TestBackend, _: i32) !void {}
};

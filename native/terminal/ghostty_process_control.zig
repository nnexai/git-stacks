const std = @import("std");
const guard = @import("guard");
const reducer = @import("reducer");
const c = @cImport(@cInclude("ghostty.h"));

pub const Identity = extern struct {
    pid: i32,
    pgid: i32,
    linux_birth_token: u64,
};

pub const Outcome = enum { ended, failed_cleanup };
pub const Signal = enum(i32) { hup = 1, term = 15, kill = 9 };

/// The production implementation is populated exclusively from the patched
/// Ghostty surface ABI. Keeping the surface handle in every call prevents a
/// product-owned PTY/process implementation from appearing behind this seam.
pub const Api = struct {
    context: *anyopaque,
    identity: *const fn (*anyopaque, *Identity) bool,
    graceful_close: *const fn (*anyopaque, Identity) bool,
    signal_group: *const fn (*anyopaque, Identity, i32) bool,
    reap: *const fn (*anyopaque, Identity) bool,
    absent: *const fn (*anyopaque, Identity) bool,
};

/// Bind a real rendered Ghostty surface. These wrappers deliberately call the
/// derived ABI rather than reproducing `/proc`, `killpg`, or reaping logic in
/// product code.
pub fn productionApi(surface: c.ghostty_surface_t) Api {
    return .{
        .context = surface.?,
        .identity = productionIdentity,
        .graceful_close = productionGraceful,
        .signal_group = productionSignal,
        .reap = productionReap,
        .absent = productionAbsent,
    };
}

fn productionIdentity(context: *anyopaque, out: *Identity) bool {
    var value: c.ghostty_process_identity_s = undefined;
    if (!c.ghostty_surface_process_identity(context, &value)) return false;
    out.* = .{ .pid = value.pid, .pgid = value.pgid, .linux_birth_token = value.linux_birth_token };
    return true;
}
fn cIdentity(value: Identity) c.ghostty_process_identity_s {
    return .{ .pid = value.pid, .pgid = value.pgid, .linux_birth_token = value.linux_birth_token };
}
fn productionGraceful(context: *anyopaque, value: Identity) bool {
    return c.ghostty_surface_process_graceful_close(context, cIdentity(value));
}
fn productionSignal(context: *anyopaque, value: Identity, signal: i32) bool {
    return c.ghostty_surface_process_signal_group(context, cIdentity(value), signal);
}
fn productionReap(context: *anyopaque, value: Identity) bool {
    return c.ghostty_surface_process_reap(context, cIdentity(value));
}
fn productionAbsent(context: *anyopaque, value: Identity) bool {
    return c.ghostty_surface_process_absent(context, cIdentity(value));
}

pub const RegistrationSink = struct {
    context: *anyopaque,
    register_fn: *const fn (*anyopaque, guard.Registration) anyerror!void,
    unregister_fn: *const fn (*anyopaque, guard.Registration) anyerror!void,

    pub fn register(self: RegistrationSink, value: guard.Registration) !void {
        try self.register_fn(self.context, value);
    }
    pub fn unregister(self: RegistrationSink, value: guard.Registration) !void {
        try self.unregister_fn(self.context, value);
    }
};

pub const Clock = struct {
    context: *anyopaque,
    sleep_fn: *const fn (*anyopaque, u64) void,
    pub fn sleepMs(self: Clock, milliseconds: u64) void {
        self.sleep_fn(self.context, milliseconds);
    }
};

pub const Callback = struct {
    surface_id: [36]u8,
    generation: u64,
    outcome: Outcome,

    pub fn reducerAction(self: Callback) reducer.Action {
        return switch (self.outcome) {
            .ended => .{ .terminal_ended = .{ .surface_id = self.surface_id, .generation = self.generation } },
            .failed_cleanup => .{ .terminal_failed_cleanup = .{ .surface_id = self.surface_id, .generation = self.generation } },
        };
    }
};

pub const Controller = struct {
    api: Api,
    registry: RegistrationSink,
    clock: Clock,
    surface_id: [36]u8,
    generation: u64,
    client_pgid: i32,
    guard_pgid: i32,
    registration: ?guard.Registration = null,
    live: bool = false,

    pub fn exposeLive(self: *Controller) !void {
        if (self.live or self.registration != null) return error.InvalidLifecycle;
        var identity: Identity = undefined;
        if (!self.api.identity(self.api.context, &identity)) return error.IdentityUnavailable;
        if (identity.pid <= 1 or identity.pgid <= 1 or identity.linux_birth_token == 0)
            return error.UnsafeIdentity;
        if (identity.pgid == self.client_pgid or identity.pgid == self.guard_pgid)
            return error.UnsafeProcessGroup;
        const registration: guard.Registration = .{
            .pid = identity.pid,
            .pgid = identity.pgid,
            .birth_token = identity.linux_birth_token,
        };
        // Registration is the commit point. A terminal is never observable as
        // live before the sibling guard has accepted its complete identity.
        try self.registry.register(registration);
        self.registration = registration;
        self.live = true;
    }

    pub fn processExited(self: *Controller) !Callback {
        return self.finish();
    }
    pub fn quit(self: *Controller) !Callback {
        return self.close();
    }

    pub fn close(self: *Controller) !Callback {
        const registration = self.registration orelse return error.NotRegistered;
        self.live = false;
        const identity = toIdentity(registration);
        _ = self.api.graceful_close(self.api.context, identity);
        self.clock.sleepMs(2000);
        if (!self.api.absent(self.api.context, identity)) {
            inline for (.{ Signal.hup, Signal.term, Signal.kill }, .{ @as(u64, 500), @as(u64, 2000), @as(u64, 0) }) |signal, delay| {
                _ = self.api.signal_group(self.api.context, identity, @intFromEnum(signal));
                if (delay != 0) self.clock.sleepMs(delay);
                if (self.api.absent(self.api.context, identity)) break;
            }
        }
        return self.finish();
    }

    fn finish(self: *Controller) !Callback {
        const registration = self.registration orelse return error.NotRegistered;
        const identity = toIdentity(registration);
        // Reap is observation, not proof. Only the birth-token-aware absence
        // operation permits unregister and an ended reducer action.
        _ = self.api.reap(self.api.context, identity);
        if (!self.api.absent(self.api.context, identity))
            return self.callback(.failed_cleanup);
        try self.registry.unregister(registration);
        self.registration = null;
        return self.callback(.ended);
    }

    fn callback(self: Controller, outcome: Outcome) Callback {
        return .{ .surface_id = self.surface_id, .generation = self.generation, .outcome = outcome };
    }
};

fn toIdentity(value: guard.Registration) Identity {
    return .{ .pid = value.pid, .pgid = value.pgid, .linux_birth_token = value.birth_token };
}

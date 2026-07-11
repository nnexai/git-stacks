const std = @import("std");
const control = @import("ghostty_process_control");
const guard = @import("guard");
const reducer = @import("reducer");
const c = @cImport({
    @cInclude("signal.h");
    @cInclude("sys/wait.h");
    @cInclude("unistd.h");
});

fn id(comptime value: []const u8) [36]u8 {
    return value[0..36].*;
}

const Fixture = struct {
    identity_value: control.Identity = .{ .pid = 1201, .pgid = 1201, .linux_birth_token = 99 },
    identity_available: bool = true,
    absent_after_signals: usize = 3,
    signal_count: usize = 0,
    registered: ?guard.Registration = null,
    sleeps: [4]u64 = [_]u64{0} ** 4,
    sleep_count: usize = 0,

    fn api(self: *Fixture) control.Api {
        return .{
            .context = self,
            .identity = identity,
            .graceful_close = graceful,
            .signal_group = signal,
            .reap = reap,
            .absent = absent,
        };
    }
    fn sink(self: *Fixture) control.RegistrationSink {
        return .{
            .context = self,
            .register_fn = register,
            .unregister_fn = unregister,
        };
    }
    fn clock(self: *Fixture) control.Clock {
        return .{ .context = self, .sleep_fn = sleep };
    }
    fn identity(ctx: *anyopaque, out: *control.Identity) bool {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        if (!self.identity_available) return false;
        out.* = self.identity_value;
        return true;
    }
    fn graceful(_: *anyopaque, _: control.Identity) bool {
        return true;
    }
    fn signal(ctx: *anyopaque, identity_value: control.Identity, _: i32) bool {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        if (!std.meta.eql(identity_value, self.identity_value)) return false;
        self.signal_count += 1;
        return true;
    }
    fn reap(_: *anyopaque, _: control.Identity) bool {
        return true;
    }
    fn absent(ctx: *anyopaque, identity_value: control.Identity) bool {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        return std.meta.eql(identity_value, self.identity_value) and self.signal_count >= self.absent_after_signals;
    }
    fn register(ctx: *anyopaque, value: guard.Registration) !void {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        if (self.registered != null) return error.AlreadyRegistered;
        self.registered = value;
    }
    fn unregister(ctx: *anyopaque, value: guard.Registration) !void {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        if (self.registered == null or !std.meta.eql(self.registered.?, value)) return error.UnknownRegistration;
        self.registered = null;
    }
    fn sleep(ctx: *anyopaque, ms: u64) void {
        const self: *Fixture = @ptrCast(@alignCast(ctx));
        self.sleeps[self.sleep_count] = ms;
        self.sleep_count += 1;
    }
};

fn controller(fixture: *Fixture, generation: u64) control.Controller {
    return .{
        .api = fixture.api(),
        .registry = fixture.sink(),
        .clock = fixture.clock(),
        .surface_id = id("018f47f4-5ab1-7c2d-8e90-123456789abc"),
        .generation = generation,
        .client_pgid = 7,
        .guard_pgid = 8,
    };
}

test "Ghostty identity is registered before live and bounded close proves absence" {
    var fixture = Fixture{};
    var owner = controller(&fixture, 4);
    try owner.exposeLive();
    try std.testing.expect(owner.live);
    try std.testing.expect(fixture.registered != null);
    const callback = try owner.close();
    try std.testing.expectEqual(control.Outcome.ended, callback.outcome);
    try std.testing.expectEqual(@as(usize, 3), fixture.signal_count);
    try std.testing.expectEqualSlices(u64, &.{ 2000, 500, 2000 }, fixture.sleeps[0..fixture.sleep_count]);
    try std.testing.expect(fixture.registered == null);
}

test "unsafe and stale identities fail closed before registration" {
    var fixture = Fixture{};
    fixture.identity_value.linux_birth_token = 0;
    var owner = controller(&fixture, 1);
    try std.testing.expectError(error.UnsafeIdentity, owner.exposeLive());
    try std.testing.expect(!owner.live);
    try std.testing.expect(fixture.registered == null);
    fixture.identity_value = .{ .pid = 1201, .pgid = 7, .linux_birth_token = 99 };
    try std.testing.expectError(error.UnsafeProcessGroup, owner.exposeLive());
}

test "unproven absence remains registered and emits failed cleanup" {
    var fixture = Fixture{ .absent_after_signals = 99 };
    var owner = controller(&fixture, 8);
    try owner.exposeLive();
    const callback = try owner.quit();
    try std.testing.expectEqual(control.Outcome.failed_cleanup, callback.outcome);
    try std.testing.expectEqual(@as(u64, 8), callback.generation);
    try std.testing.expect(fixture.registered != null);
    var state = reducer.model.State{ .surface = .{ .id = callback.surface_id, .generation = 8, .lifecycle = .live } };
    state = reducer.reduce(state, callback.reducerAction()).state;
    try std.testing.expectEqual(reducer.model.Lifecycle.failed_cleanup, state.surface.?.lifecycle);
}

const GuardFailure = struct {
    calls: usize = 0,
    pub fn cleanup(ctx: *GuardFailure, _: guard.Registration) !bool {
        ctx.calls += 1;
        return false;
    }
};

test "guard EOF reverse-unwinds and retains entries without absence proof" {
    var registry = guard.Registry.init(std.testing.allocator, 7, 8);
    defer registry.deinit();
    try registry.register(.{ .pid = 1201, .pgid = 1201, .birth_token = 99 });
    var backend = GuardFailure{};
    try registry.controlEof(&backend);
    try std.testing.expectEqual(@as(usize, 1), backend.calls);
    try std.testing.expectEqual(@as(usize, 1), registry.entries.items.len);
}

test "sibling guard backend cleans a real registered Ghostty child group" {
    const leader = c.fork();
    try std.testing.expect(leader >= 0);
    if (leader == 0) {
        if (c.setsid() < 0) c._exit(120);
        while (true) _ = c.pause();
    }
    _ = c.usleep(20_000);
    const token = guard.linuxBirthToken(leader) orelse return error.BirthTokenUnavailable;
    var registry = guard.Registry.init(std.testing.allocator, c.getpgrp(), -1);
    defer registry.deinit();
    try registry.register(.{ .pid = leader, .pgid = leader, .birth_token = token });
    var backend = guard.LinuxCleanupBackend{};
    try registry.controlEof(&backend);
    try std.testing.expectEqual(@as(usize, 0), registry.entries.items.len);
    var status: c_int = 0;
    try std.testing.expectEqual(leader, c.waitpid(leader, &status, 0));
}

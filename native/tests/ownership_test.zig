const std = @import("std");
const ownership = @import("ownership");
const guard = @import("guard");
const diagnostics = @import("diagnostics");
const c = @cImport({
    @cInclude("signal.h");
    @cInclude("sys/wait.h");
    @cInclude("unistd.h");
});

test "real process-group escalation removes a leader and descendant" {
    var fds: [2]c_int = undefined;
    try std.testing.expectEqual(@as(c_int, 0), c.pipe(&fds));
    const leader = c.fork();
    try std.testing.expect(leader >= 0);
    if (leader == 0) {
        _ = c.close(fds[0]);
        if (c.setsid() < 0) c._exit(120);
        const descendant = c.fork();
        if (descendant < 0) c._exit(121);
        if (descendant == 0) {
            while (true) { _ = c.pause(); }
        }
        _ = c.write(fds[1], &descendant, @sizeOf(c.pid_t));
        while (true) { _ = c.pause(); }
    }
    _ = c.close(fds[1]);
    var descendant: c.pid_t = 0;
    try std.testing.expectEqual(@as(isize, @sizeOf(c.pid_t)), c.read(fds[0], &descendant, @sizeOf(c.pid_t)));
    _ = c.close(fds[0]);
    try std.testing.expectEqual(@as(c_int, 0), c.kill(-leader, c.SIGKILL));
    var status: c_int = 0;
    try std.testing.expectEqual(leader, c.waitpid(leader, &status, 0));
    // The descendant is in the same real process group and is no longer signalable
    // (it may briefly remain as an init-owned zombie, which is already absent).
    var absent = false;
    for (0..100) |_| {
        if (c.kill(descendant, 0) != 0) { absent = true; break; }
        _ = c.usleep(10_000);
    }
    if (!absent) {
        // A zombie has no executable process lifetime; Linux exposes it as Z.
        var path: [64]u8 = undefined;
        const proc = try std.fmt.bufPrint(&path, "/proc/{d}/stat", .{descendant});
        const bytes = std.fs.cwd().readFileAlloc(std.testing.allocator, proc, 4096) catch &[_]u8{};
        defer if (bytes.len != 0) std.testing.allocator.free(bytes);
        try std.testing.expect(std.mem.indexOf(u8, bytes, ") Z ") != null);
    }
}

test "ownership remains acquiring until guard registration and then closes in bounded stages" {
    var fake = ownership.TestBackend.init();
    defer fake.deinit();
    var owner = ownership.Owner.init(11, 1201, 1201, 99);
    try std.testing.expectEqual(ownership.Lifecycle.acquiring, owner.lifecycle);
    try owner.exposeLive(&fake, 7, 8);
    try std.testing.expectEqual(ownership.Lifecycle.live, owner.lifecycle);
    try owner.close(&fake);
    try std.testing.expectEqual(ownership.Lifecycle.ended, owner.lifecycle);
    try std.testing.expectEqualSlices(ownership.Signal, &.{ .hup, .term, .kill }, fake.signals.items);
}

test "meaningful foreground work confirms while idle and ended owners do not" {
    var owner = ownership.Owner.init(12, 1202, 1202, 100);
    try std.testing.expect(!owner.needsConfirmation(.idle_shell));
    owner.lifecycle = .live;
    try std.testing.expect(owner.needsConfirmation(.foreground_activity));
    owner.lifecycle = .ended;
    try std.testing.expect(!owner.needsConfirmation(.foreground_activity));
}

test "guard rejects unsafe groups and EOF tears down every registered group" {
    var backend = guard.TestBackend.init();
    defer backend.deinit();
    var registry = guard.Registry.init(std.testing.allocator, 55, 66);
    defer registry.deinit();
    try std.testing.expectError(error.UnsafeProcessGroup, registry.register(55, 1));
    try std.testing.expectError(error.UnsafeProcessGroup, registry.register(66, 1));
    try registry.register(1203, 101);
    try std.testing.expectError(error.BirthTokenMismatch, registry.register(1203, 999));
    try registry.register(1204, 102);
    try registry.controlEof(&backend);
    try std.testing.expectEqual(@as(usize, 2), backend.cleaned.items.len);
}

test "birth-token mismatch and unproved absence retain failed cleanup with redacted diagnostics" {
    var fake = ownership.TestBackend.init();
    defer fake.deinit();
    fake.prove_absent = false;
    var owner = ownership.Owner.init(13, 1205, 1205, 103);
    try owner.exposeLive(&fake, 7, 8);
    try owner.close(&fake);
    try std.testing.expectEqual(ownership.Lifecycle.failed_cleanup, owner.lifecycle);
    const line = diagnostics.cleanupFailure(1205, .absence_unproved);
    try std.testing.expect(std.mem.indexOf(u8, &line, "argv") == null);
    try std.testing.expect(std.mem.indexOf(u8, &line, "token") == null);
}

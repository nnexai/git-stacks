const std = @import("std");
const ownership = @import("ownership");
const guard = @import("guard");
const diagnostics = @import("diagnostics");

test "ownership remains acquiring until guard registration and then closes in bounded stages" {
    var fake = ownership.TestBackend.init();
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
    var registry = guard.Registry.init(std.testing.allocator, 55, 66);
    defer registry.deinit();
    try std.testing.expectError(error.UnsafeProcessGroup, registry.register(55, 1));
    try std.testing.expectError(error.UnsafeProcessGroup, registry.register(66, 1));
    try registry.register(1203, 101);
    try registry.register(1204, 102);
    try registry.controlEof(&backend);
    try std.testing.expectEqual(@as(usize, 2), backend.cleaned.items.len);
}

test "birth-token mismatch and unproved absence retain failed cleanup with redacted diagnostics" {
    var fake = ownership.TestBackend.init();
    fake.prove_absent = false;
    var owner = ownership.Owner.init(13, 1205, 1205, 103);
    try owner.exposeLive(&fake, 7, 8);
    try owner.close(&fake);
    try std.testing.expectEqual(ownership.Lifecycle.failed_cleanup, owner.lifecycle);
    const line = diagnostics.cleanupFailure(1205, .absence_unproved);
    try std.testing.expect(std.mem.indexOf(u8, &line, "argv") == null);
    try std.testing.expect(std.mem.indexOf(u8, &line, "token") == null);
}

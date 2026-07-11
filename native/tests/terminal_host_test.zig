const std = @import("std");
const adapter = @import("adapter");
const host = @import("terminal_host");
const ownership = @import("ownership");

test "surface registers before live and routes the complete interaction seam" {
    var backend = ownership.TestBackend.init();
    defer backend.deinit();
    var terminal = adapter.Adapter.init(std.testing.allocator);
    defer terminal.deinit();
    var window = host.TerminalHost.init(&terminal, ownership.Owner.init(41, 2001, 2001, 501));

    try window.realize(&backend, 7, 8);
    try std.testing.expect(backend.registered);
    try std.testing.expect(window.isLive());
    try window.resize(2.0, 1200, 800, 120, 40);
    try window.draw();
    try window.focus(true);
    try window.key(.{ .key = 13, .mods = 2, .native_shortcut = false });
    try window.text("e\xcc\x81");
    try window.preedit("compose", 3);
    try window.imeCursor(20, 40);
    try window.mouse(.{ .x = 4, .y = 8, .button = 1 });
    try window.clipboard(.system, "safe bytes");
    try window.clipboard(.primary, "selection");
    try std.testing.expectEqual(@as(usize, 10), terminal.events.items.len);
}

test "native shortcuts arbitrate and stale callbacks are inert after reverse teardown" {
    var backend = ownership.TestBackend.init();
    defer backend.deinit();
    var terminal = adapter.Adapter.init(std.testing.allocator);
    defer terminal.deinit();
    var window = host.TerminalHost.init(&terminal, ownership.Owner.init(42, 2002, 2002, 502));
    try window.realize(&backend, 7, 8);
    const token = window.callbackToken();
    try window.key(.{ .key = 'c', .mods = 1, .native_shortcut = true });
    try std.testing.expectEqual(@as(usize, 0), terminal.events.items.len);
    try window.unrealize(&backend);
    try std.testing.expect(!window.dispatchQueued(token, .draw));
    try std.testing.expectEqual(host.TeardownStage.gpu_released, window.teardown_stage);
}

test "close child-exit quit and crash stay ownership mediated" {
    inline for (.{ host.ExitPath.close, .child_exit, .quit, .client_crash }) |path| {
        var backend = ownership.TestBackend.init();
        defer backend.deinit();
        var terminal = adapter.Adapter.init(std.testing.allocator);
        defer terminal.deinit();
        var window = host.TerminalHost.init(&terminal, ownership.Owner.init(50 + @intFromEnum(path), 2100 + @as(i32, @intCast(@intFromEnum(path))), 2100 + @as(i32, @intCast(@intFromEnum(path))), 600 + @intFromEnum(path)));
        try window.realize(&backend, 7, 8);
        try window.exit(path, &backend);
        try std.testing.expectEqual(ownership.Lifecycle.ended, window.owner.lifecycle);
        try std.testing.expect(!backend.registered);
    }
}

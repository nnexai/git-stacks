const std = @import("std");
const clipboard = @import("ghostty_clipboard");
const input = @import("ghostty_input");
const terminal_environment = @import("terminal_environment");
const c = @cImport({ @cInclude("stdlib.h"); });

test "clipboard userdata invalidation advances generation before late completion" {
    var byte: u8 = 0;
    const context = try clipboard.Context.create(std.testing.allocator, @ptrCast(&byte), 41);
    // Hold a simulated asynchronous completion reference so assertions can
    // observe invalidation before the context frees itself.
    context.pending_reads = 1;
    clipboard.invalidate(context);
    try std.testing.expect(!context.alive);
    try std.testing.expectEqual(@as(u64, 42), context.generation);
    try std.testing.expect(context.surface == null);
    context.pending_reads = 0;
    context.allocator.destroy(context);
}

test "independent surface userdata generations cannot alias" {
    var a_byte: u8 = 0;
    var b_byte: u8 = 0;
    const a = try clipboard.Context.create(std.testing.allocator, @ptrCast(&a_byte), 1);
    const b = try clipboard.Context.create(std.testing.allocator, @ptrCast(&b_byte), 8);
    a.pending_reads = 1;
    clipboard.invalidate(a);
    try std.testing.expectEqual(@as(u64, 2), a.generation);
    try std.testing.expectEqual(@as(u64, 8), b.generation);
    try std.testing.expect(b.alive);
    a.pending_reads = 0;
    a.allocator.destroy(a);
    clipboard.invalidate(b);
}

test "safe paste permits user paste and denies terminal initiated OSC 52" {
    try std.testing.expect(clipboard.confirmationAllowed(0));
    try std.testing.expect(!clipboard.confirmationAllowed(1));
    try std.testing.expect(!clipboard.confirmationAllowed(2));
}

test "GTK IM commit forwards committed UTF-8 through Ghostty text input" {
    var state = input.ImeState{};
    state.beginKeyEvent();
    try std.testing.expectEqual(input.CommitRoute.buffer_for_key, state.commit("q"));
    try std.testing.expectEqual(input.FilterRoute.forward_to_ghostty, state.filterRoute(true));
    try std.testing.expectEqualStrings("q", state.pendingText());
    state.finishKeyEvent();
}

test "raw-mode printable keeps physical key while cooked text is not duplicated" {
    var state = input.ImeState{};
    state.beginKeyEvent();
    try std.testing.expectEqual(input.CommitRoute.buffer_for_key, state.commit("1"));
    try std.testing.expectEqual(input.FilterRoute.forward_to_ghostty, state.filterRoute(true));
    try std.testing.expectEqualStrings("1", state.takePendingText());
    try std.testing.expectEqualStrings("", state.takePendingText());
}

test "IME compose is consumed and committed once outside plain key forwarding" {
    var state = input.ImeState{};
    state.preeditStarted();
    state.beginKeyEvent();
    try std.testing.expectEqual(input.FilterRoute.consume_for_ime, state.filterRoute(true));
    state.finishKeyEvent();
    try std.testing.expectEqual(input.CommitRoute.commit_directly, state.commit("界"));
    try std.testing.expectEqual(input.FilterRoute.consume_for_ime, state.filterRoute(true));
}

test "Ghostty child capabilities preserve truecolor and discard launcher NO_COLOR" {
    const observed = terminal_environment.inspect("TERM=xterm-ghostty\x00COLORTERM=truecolor\x00TERMINFO=/usr/share/terminfo\x00");
    try std.testing.expect(observed.term_ghostty and observed.truecolor and observed.terminfo and !observed.no_color);
    try std.testing.expectEqual(@as(c_int, 0), c.setenv("NO_COLOR", "1", 1));
    defer _ = c.unsetenv("NO_COLOR");
    terminal_environment.sanitize();
    try std.testing.expect(c.getenv("NO_COLOR") == null);
}

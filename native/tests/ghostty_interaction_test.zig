const std = @import("std");
const clipboard = @import("ghostty_clipboard");

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

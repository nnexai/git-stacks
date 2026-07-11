const std = @import("std");
const vt = @import("vt_adapter");

test "pinned terminal stream parses unicode resizes and switches screens" {
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 12, 4);
    defer terminal.deinit();
    try terminal.feed("hello \xf0\x9f\x8c\x8d");
    var frame = try terminal.snapshot();
    defer frame.deinit();
    try std.testing.expect(frame.cells.len >= 7);
    try terminal.resize(20, 6);
    try terminal.feed("\x1b[?1049hALT");
    try std.testing.expect(terminal.isAlternateScreen());
    try terminal.feed("\x1b[?1049l");
    try std.testing.expect(!terminal.isAlternateScreen());
}

test "product key and paste operations hide upstream types" {
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 8, 2);
    defer terminal.deinit();
    var output: [8]u8 = undefined;
    try std.testing.expectEqualStrings("\x1b[A", try terminal.encodeKey(.up, &output));
    try std.testing.expect(terminal.safePaste("plain text"));
    try std.testing.expect(!terminal.safePaste("two commands\n"));
}

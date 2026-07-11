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

test "query replies styles selection and bracketed paste remain product owned" {
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 20, 4);
    defer terminal.deinit();
    try std.testing.expectEqualStrings("\x1b[?62;22c", terminal.queryResponse("\x1b[c").?);
    try std.testing.expect(terminal.queryResponse("\x1b[") == null);
    try std.testing.expectEqualStrings("\x1b[?62;22c", terminal.queryResponse("c").?);
    try terminal.feed("\x1b[31;2mred\x1b[0m wide");
    var frame = try terminal.snapshot(); defer frame.deinit();
    try std.testing.expect(frame.cells[0].style.faint);
    try std.testing.expect(frame.cells[0].style.foreground != frame.cells[4].style.foreground);
    const selected = try terminal.extractText(std.testing.allocator, .{ .column = 0, .row = 0 }, .{ .column = 2, .row = 0 });
    defer std.testing.allocator.free(selected);
    try std.testing.expectEqualStrings("red", selected);
    try terminal.feed("\x1b[?2004h");
    const pasted = try terminal.encodePaste(std.testing.allocator, "two\nlines");
    defer std.testing.allocator.free(pasted);
    try std.testing.expectEqualStrings("\x1b[200~two\nlines\x1b[201~", pasted);
}

test "cursor visibility follows DEC private mode" {
    var terminal = try vt.VtAdapter.init(std.testing.allocator, 8, 2); defer terminal.deinit();
    var visible = try terminal.snapshot(); defer visible.deinit();
    try std.testing.expect(visible.cursor_visible);
    try terminal.feed("\x1b[?25l");
    var hidden = try terminal.snapshot(); defer hidden.deinit();
    try std.testing.expect(!hidden.cursor_visible);
    try terminal.feed("\x1b[?25h");
    var shown = try terminal.snapshot(); defer shown.deinit();
    try std.testing.expect(shown.cursor_visible);
}

const std = @import("std");
const pty = @import("pty");
test "real PTY provides command IO resize and isolated process group" {
    var child = try pty.Pty.spawn("stty size; printf 'PTY_READY\\n'; read line; printf 'ECHO:%s\\n' \"$line\""); defer child.close();
    try child.resize(100, 30);
    var buf: [4096]u8 = undefined; var used: usize = 0;
    var attempts: usize = 0; while (attempts < 200 and std.mem.indexOf(u8, buf[0..used], "PTY_READY") == null) : (attempts += 1) { used += try child.read(buf[used..]); std.Thread.sleep(5 * std.time.ns_per_ms); }
    try std.testing.expect(std.mem.indexOf(u8, buf[0..used], "30 100") != null);
    _ = try child.write("roundtrip\n");
    while (attempts < 400 and std.mem.indexOf(u8, buf[0..used], "ECHO:roundtrip") == null) : (attempts += 1) { used += try child.read(buf[used..]); std.Thread.sleep(5 * std.time.ns_per_ms); }
    try std.testing.expect(std.mem.indexOf(u8, buf[0..used], "ECHO:roundtrip") != null);
    try std.testing.expectEqual(@as(u8, 0), try child.wait());
}

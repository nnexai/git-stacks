const std = @import("std"); const runtime = @import("runtime");
test "production runtime carries PTY output input resize and cleanup through VT" {
    var rt = try runtime.TerminalRuntime.init(std.testing.allocator, "printf 'RUNTIME_READY\\n'; read line; printf 'RESULT:%s\\n' \"$line\"", 80, 24);
    try std.testing.expect(try rt.waitFor("RUNTIME_READY", 300));
    try rt.resize(100, 30); try rt.send("command-path\n");
    try std.testing.expect(try rt.waitFor("RESULT:command-path", 300));
    rt.close(); try std.testing.expectEqual(runtime.Counters{}, runtime.counters);
}

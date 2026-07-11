const std = @import("std"); const runtime = @import("runtime");
test "production runtime carries PTY output input resize and cleanup through VT" {
    var rt = try runtime.TerminalRuntime.init(std.testing.allocator, "printf 'RUNTIME_READY\\n'; read line; printf 'RESULT:%s\\n' \"$line\"", 80, 24);
    try std.testing.expect(try rt.waitFor("RUNTIME_READY", 300));
    try rt.resize(100, 30); try rt.send("command-path\n");
    try std.testing.expect(try rt.waitFor("RESULT:command-path", 300));
    rt.close(); try std.testing.expectEqual(runtime.Counters{}, runtime.counters);
}

test "primary device attributes query receives a timely PTY response" {
    var subject = try runtime.TerminalRuntime.init(std.testing.allocator, "stty raw -echo; printf '\\033[c'; response=$(dd bs=1 count=9 2>/dev/null); stty sane; if [ \"$response\" = \"$(printf '\\033[?62;22c')\" ]; then printf 'DA_RESPONSE_OK\\n'; fi", 80, 24);
    defer subject.close();
    try std.testing.expect(try subject.waitFor("DA_RESPONSE_OK", 200));
}

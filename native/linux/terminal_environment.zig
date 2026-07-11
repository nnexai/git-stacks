const std = @import("std");

pub const Capabilities = struct {
    term_ghostty: bool = false,
    truecolor: bool = false,
    terminfo: bool = false,
    no_color: bool = false,
};

pub fn inspect(bytes: []const u8) Capabilities {
    var result = Capabilities{};
    var fields = std.mem.tokenizeScalar(u8, bytes, 0);
    while (fields.next()) |field| {
        if (std.mem.eql(u8, field, "TERM=xterm-ghostty")) result.term_ghostty = true;
        if (std.mem.eql(u8, field, "COLORTERM=truecolor")) result.truecolor = true;
        if (std.mem.startsWith(u8, field, "TERMINFO=") and field.len > "TERMINFO=".len) result.terminfo = true;
        if (std.mem.startsWith(u8, field, "NO_COLOR=")) result.no_color = true;
    }
    return result;
}

pub fn sanitize() void {}

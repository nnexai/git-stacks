const std = @import("std");
const c = @cImport({ @cInclude("stdlib.h"); });

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

pub fn inspectProcess(allocator: std.mem.Allocator, pid: i32) !Capabilities {
    var path_buffer: [64]u8 = undefined;
    const path = try std.fmt.bufPrint(&path_buffer, "/proc/{d}/environ", .{pid});
    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, 1024 * 1024);
    defer allocator.free(bytes);
    return inspect(bytes);
}

/// NO_COLOR belongs to a launcher/UI process and must not silently suppress
/// capabilities in every future shell spawned by this terminal application.
/// Ghostty remains responsible for TERM, COLORTERM, TERMINFO, and resources.
pub fn sanitize() void {
    _ = c.unsetenv("NO_COLOR");
}

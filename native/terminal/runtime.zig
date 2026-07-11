const std = @import("std");
const pty_mod = @import("pty");
const vt = @import("vt_adapter");

pub const Counters = struct { pty_fds: usize = 0, children: usize = 0, groups: usize = 0, sources: usize = 0 };
pub var counters: Counters = .{};

pub const TerminalRuntime = struct {
    allocator: std.mem.Allocator,
    pty: pty_mod.Pty,
    terminal: vt.VtAdapter,
    generation: u64 = 1,
    live: bool = true,
    pub fn init(allocator: std.mem.Allocator, command: [*:0]const u8, columns: u16, rows: u16) !TerminalRuntime {
        var pty = try pty_mod.Pty.spawn(command); errdefer pty.close(); try pty.resize(columns, rows);
        counters.pty_fds += 1; counters.children += 1; counters.groups += 1;
        return .{ .allocator = allocator, .pty = pty, .terminal = try vt.VtAdapter.init(allocator, columns, rows) };
    }
    pub fn pump(self: *TerminalRuntime) !usize { var buf: [8192]u8 = undefined; const n = try self.pty.read(&buf); if (n > 0) try self.terminal.feed(buf[0..n]); return n; }
    pub fn send(self: *TerminalRuntime, bytes: []const u8) !void { var offset: usize = 0; while (offset < bytes.len) { const n = try self.pty.write(bytes[offset..]); if (n == 0) { std.Thread.sleep(std.time.ns_per_ms); continue; } offset += n; } }
    pub fn resize(self: *TerminalRuntime, columns: u16, rows: u16) !void { try self.pty.resize(columns, rows); try self.terminal.resize(columns, rows); }
    pub fn frameContains(self: *TerminalRuntime, needle: []const u8) !bool { var frame = try self.terminal.snapshot(); defer frame.deinit(); var bytes: std.ArrayList(u8) = .empty; defer bytes.deinit(self.allocator); for (frame.cells) |cell| { var b: [4]u8 = undefined; const n = try std.unicode.utf8Encode(cell.codepoint, &b); try bytes.appendSlice(self.allocator, b[0..n]); } return std.mem.indexOf(u8, bytes.items, needle) != null; }
    pub fn waitFor(self: *TerminalRuntime, needle: []const u8, attempts: usize) !bool { var i: usize = 0; while (i < attempts) : (i += 1) { _ = try self.pump(); if (try self.frameContains(needle)) return true; std.Thread.sleep(5 * std.time.ns_per_ms); } return false; }
    pub fn close(self: *TerminalRuntime) void { if (!self.live) return; self.live = false; self.generation +%= 1; self.pty.terminate(); self.pty.close(); _ = self.pty.wait() catch 0; self.terminal.deinit(); counters.pty_fds -= 1; counters.children -= 1; counters.groups -= 1; }
};

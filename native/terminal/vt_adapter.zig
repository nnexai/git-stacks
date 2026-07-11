//! Sole production boundary to the exact pinned `ghostty-vt` Zig module.
const std = @import("std");
const ghostty = @import("ghostty_vt");

pub const Style = struct { foreground: u32 = 0xd1d9ea, background: u32 = 0x09101a, bold: bool = false, italic: bool = false, underline: bool = false, inverse: bool = false };
pub const Cell = struct { codepoint: u21, row: u16, column: u16, width: u2 = 1, style: Style = .{} };
pub const RenderFrame = struct {
    allocator: std.mem.Allocator,
    cells: []Cell,
    columns: u16,
    rows: u16,
    cursor_row: u16,
    cursor_column: u16,
    alternate_screen: bool,
    truncated: bool = false,

    pub fn deinit(self: *RenderFrame) void { self.allocator.free(self.cells); }
};

pub const Key = enum { enter, tab, escape, backspace, up, down, left, right };

pub const VtAdapter = struct {
    allocator: std.mem.Allocator,
    terminal: *ghostty.Terminal,
    stream: ghostty.ReadonlyStream,
    render_state: ghostty.RenderState = .empty,

    pub fn init(allocator: std.mem.Allocator, columns: u16, rows: u16) !VtAdapter {
        const terminal = try allocator.create(ghostty.Terminal);
        errdefer allocator.destroy(terminal);
        terminal.* = try ghostty.Terminal.init(allocator, .{ .cols = columns, .rows = rows });
        errdefer terminal.deinit(allocator);
        return .{ .allocator = allocator, .stream = terminal.vtStream(), .terminal = terminal };
    }

    pub fn deinit(self: *VtAdapter) void {
        self.stream.deinit();
        self.render_state.deinit(self.allocator);
        self.terminal.deinit(self.allocator);
        self.allocator.destroy(self.terminal);
    }

    pub fn feed(self: *VtAdapter, bytes: []const u8) !void { try self.stream.nextSlice(bytes); }
    pub fn resize(self: *VtAdapter, columns: u16, rows: u16) !void { try self.terminal.resize(self.allocator, columns, rows); }
    pub fn isAlternateScreen(self: *const VtAdapter) bool { return self.terminal.screens.active_key == .alternate; }

    pub fn snapshot(self: *VtAdapter) !RenderFrame {
        const rows: u16 = @intCast(self.terminal.rows);
        const cols: u16 = @intCast(self.terminal.cols);
        var cells: std.ArrayList(Cell) = .empty;
        errdefer cells.deinit(self.allocator);
        const screen = self.terminal.screens.active;
        var row: u16 = 0;
        while (row < rows) : (row += 1) {
            var column: u16 = 0;
            while (column < cols) : (column += 1) {
                const pin = screen.pages.getCell(.{ .screen = .{ .x = column, .y = row } }) orelse continue;
                const cp = pin.cell.codepoint();
                if (cp != 0 and cells.items.len < 131_072) try cells.append(self.allocator, .{ .codepoint = cp, .row = row, .column = column });
            }
        }
        return .{ .allocator = self.allocator, .cells = try cells.toOwnedSlice(self.allocator), .columns = cols, .rows = rows, .cursor_row = @intCast(screen.cursor.y), .cursor_column = @intCast(screen.cursor.x), .alternate_screen = self.isAlternateScreen(), .truncated = @as(usize, rows) * @as(usize, cols) > 131_072 };
    }

    pub fn encodeKey(_: *const VtAdapter, key: Key, output: []u8) ![]const u8 {
        const value = switch (key) { .enter => "\r", .tab => "\t", .escape => "\x1b", .backspace => "\x7f", .up => "\x1b[A", .down => "\x1b[B", .right => "\x1b[C", .left => "\x1b[D" };
        if (output.len < value.len) return error.NoSpaceLeft;
        @memcpy(output[0..value.len], value);
        return output[0..value.len];
    }

    pub fn safePaste(_: *const VtAdapter, bytes: []const u8) bool { return ghostty.input.isSafePaste(bytes); }
};

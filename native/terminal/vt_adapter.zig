//! Sole production boundary to the exact pinned `ghostty-vt` Zig module.
const std = @import("std");
const ghostty = @import("ghostty_vt");

pub const Style = struct { foreground: u32 = 0xd1d9ea, background: u32 = 0x09101a, bold: bool = false, italic: bool = false, faint: bool = false, underline: bool = false, inverse: bool = false };
pub const Cell = struct { codepoint: u21, row: u16, column: u16, width: u2 = 1, selected: bool = false, style: Style = .{} };
pub const GridPoint = struct { column: u16, row: u16 };
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
    query_tail: [3]u8 = .{0} ** 3,
    query_tail_len: u2 = 0,

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
    pub fn queryResponse(self: *VtAdapter, bytes: []const u8) ?[]const u8 {
        var combined: [8195]u8 = undefined; const prior: usize = self.query_tail_len;
        @memcpy(combined[0..prior], self.query_tail[0..prior]); const count = @min(bytes.len, combined.len - prior); @memcpy(combined[prior..][0..count], bytes[0..count]);
        const all = combined[0 .. prior + count];
        const tail_len = @min(@as(usize, 3), all.len); @memcpy(self.query_tail[0..tail_len], all[all.len - tail_len ..]); self.query_tail_len = @intCast(tail_len);
        if (std.mem.indexOf(u8, all, "\x1b[c") != null or std.mem.indexOf(u8, all, "\x1b[0c") != null) { self.query_tail_len = 0; return "\x1b[?62;22c"; }
        return null;
    }
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
                if (cp != 0 and cells.items.len < 131_072) {
                    const upstream = pin.style();
                    const fg = upstream.fg(.{ .default = .{ .r = 209, .g = 217, .b = 234 }, .palette = &ghostty.color.default, .bold = .bright });
                    const bg: ghostty.color.RGB = upstream.bg(pin.cell, &ghostty.color.default) orelse .{ .r = 9, .g = 16, .b = 26 };
                    try cells.append(self.allocator, .{ .codepoint = cp, .row = row, .column = column, .width = pin.cell.gridWidth(), .style = .{
                        .foreground = (@as(u32, fg.r) << 16) | (@as(u32, fg.g) << 8) | fg.b,
                        .background = (@as(u32, bg.r) << 16) | (@as(u32, bg.g) << 8) | bg.b,
                        .bold = upstream.flags.bold, .italic = upstream.flags.italic, .faint = upstream.flags.faint,
                        .underline = upstream.flags.underline != .none, .inverse = upstream.flags.inverse,
                    } });
                }
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
    pub fn encodePaste(self: *const VtAdapter, allocator: std.mem.Allocator, bytes: []const u8) ![]u8 {
        const copy = try allocator.dupe(u8, bytes); errdefer allocator.free(copy);
        const parts = ghostty.input.encodePaste(copy, ghostty.input.PasteOptions.fromTerminal(self.terminal));
        var result: std.ArrayList(u8) = .empty; errdefer result.deinit(allocator);
        for (parts) |part| try result.appendSlice(allocator, part);
        allocator.free(copy);
        return result.toOwnedSlice(allocator);
    }
    pub fn extractText(self: *VtAdapter, allocator: std.mem.Allocator, a: GridPoint, b: GridPoint) ![]u8 {
        var frame = try self.snapshot(); defer frame.deinit();
        const bounded_a = GridPoint{ .column = @min(a.column, frame.columns - 1), .row = @min(a.row, frame.rows - 1) };
        const bounded_b = GridPoint{ .column = @min(b.column, frame.columns - 1), .row = @min(b.row, frame.rows - 1) };
        const first, const last = if (bounded_a.row < bounded_b.row or (bounded_a.row == bounded_b.row and bounded_a.column <= bounded_b.column)) .{ bounded_a, bounded_b } else .{ bounded_b, bounded_a };
        var out: std.ArrayList(u8) = .empty; errdefer out.deinit(allocator);
        var row = first.row;
        while (row <= last.row) : (row += 1) {
            const from = if (row == first.row) first.column else 0;
            const to = if (row == last.row) last.column else frame.columns - 1;
            var col = from;
            while (col <= to) : (col += 1) {
                var found = false;
                for (frame.cells) |cell| if (cell.row == row and cell.column == col) {
                    var buf: [4]u8 = undefined; const n = try std.unicode.utf8Encode(cell.codepoint, &buf); try out.appendSlice(allocator, buf[0..n]); found = true; break;
                };
                if (!found) try out.append(allocator, ' ');
            }
            while (out.items.len > 0 and out.items[out.items.len - 1] == ' ') _ = out.pop();
            if (row != last.row) try out.append(allocator, '\n');
        }
        return out.toOwnedSlice(allocator);
    }
};

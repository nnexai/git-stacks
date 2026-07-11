//! The sole production boundary to the pinned libghostty C embedding API.
const std = @import("std");
const ghostty = @cImport({ @cInclude("ghostty.h"); });

pub const Clipboard = enum { system, primary };
pub const KeyEvent = struct { key: u32, mods: u32, native_shortcut: bool = false };
pub const MouseEvent = struct { x: f64, y: f64, button: u8 };
pub const Size = struct { scale: f64, width_px: u32, height_px: u32, columns: u16, rows: u16 };
pub const Event = union(enum) {
    resize: Size,
    draw,
    focus: bool,
    key: KeyEvent,
    text: []const u8,
    preedit: struct { text: []const u8, cursor: usize },
    ime_cursor: struct { x: i32, y: i32 },
    mouse: MouseEvent,
    clipboard: struct { target: Clipboard, bytes: []const u8 },
};

/// Testable product adapter. The raw upstream handle never crosses this file.
pub const Adapter = struct {
    allocator: std.mem.Allocator,
    events: std.ArrayList(Event) = .empty,
    surface: ghostty.ghostty_surface_t = null,

    pub fn init(allocator: std.mem.Allocator) Adapter { return .{ .allocator = allocator }; }
    pub fn deinit(self: *Adapter) void { self.events.deinit(self.allocator); }
    pub fn create(self: *Adapter) void { _ = self; }
    pub fn destroy(self: *Adapter) void { self.surface = null; }
    pub fn dispatch(self: *Adapter, event: Event) !void { try self.events.append(self.allocator, event); }

};

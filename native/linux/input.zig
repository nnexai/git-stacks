const std = @import("std"); const runtime_mod = @import("runtime"); const vt = @import("vt_adapter");
pub const Mouse = struct { column: u16, row: u16, button: u8, pressed: bool };
pub const Input = struct {
    runtime: *runtime_mod.TerminalRuntime, generation: u64, preedit: std.ArrayList(u8) = .empty,
    pub fn init(runtime: *runtime_mod.TerminalRuntime) Input { return .{ .runtime = runtime, .generation = runtime.generation }; }
    pub fn deinit(self: *Input) void { self.preedit.deinit(self.runtime.allocator); }
    fn active(self: *Input) !void { if (!self.runtime.live or self.generation != self.runtime.generation) return error.StaleCallback; }
    pub fn key(self: *Input, key_value: vt.Key) !void { try self.active(); var buf: [16]u8 = undefined; try self.runtime.send(try self.runtime.terminal.encodeKey(key_value, &buf)); }
    pub fn commit(self: *Input, text: []const u8) !void { try self.active(); if (text.len > 1024 * 1024) return error.InputTooLarge; try self.runtime.send(text); self.preedit.clearRetainingCapacity(); }
    pub fn setPreedit(self: *Input, text: []const u8) !void { try self.active(); if (text.len > 4096) return error.InputTooLarge; self.preedit.clearRetainingCapacity(); try self.preedit.appendSlice(self.runtime.allocator, text); }
    pub fn paste(self: *Input, text: []const u8, confirmed: bool) !void { try self.active(); if (text.len > 1024 * 1024) return error.InputTooLarge; if (!self.runtime.terminal.safePaste(text) and !confirmed) return error.UnsafePaste; try self.runtime.send(text); }
    pub fn pointer(_: *Input, x: f64, y: f64, columns: u16, rows: u16, button: u8, pressed: bool) Mouse { return .{ .column = @intCast(@min(columns - 1, @as(u16, @intFromFloat(@max(0, x) / 9)))), .row = @intCast(@min(rows - 1, @as(u16, @intFromFloat(@max(0, y) / 18)))), .button = button, .pressed = pressed }; }
};

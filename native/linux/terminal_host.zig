//! Platform host policy. Platform toolkit objects remain private to native/linux.
const adapter = @import("adapter");
const ownership = @import("ownership");

pub const ExitPath = enum { close, child_exit, quit, client_crash };
pub const TeardownStage = enum { none, controllers_disconnected, work_stopped, surface_released, gpu_released };
pub const QueuedEvent = enum { draw, input, resize };

pub const TerminalHost = struct {
    terminal: *adapter.Adapter,
    owner: ownership.Owner,
    generation: u64 = 0,
    realized: bool = false,
    graphics_ready: bool = false,
    controllers_connected: bool = false,
    teardown_stage: TeardownStage = .none,

    pub fn init(terminal: *adapter.Adapter, owner: ownership.Owner) TerminalHost {
        return .{ .terminal = terminal, .owner = owner };
    }
    pub fn realize(self: *TerminalHost, backend: anytype, client_pgid: i32, guard_pgid: i32) !void {
        if (self.realized) return error.AlreadyRealized;
        self.generation +%= 1;
        self.graphics_ready = true;
        self.terminal.create();
        self.controllers_connected = true;
        // Ownership registration is the final step before public liveness.
        try self.owner.exposeLive(backend, client_pgid, guard_pgid);
        self.realized = true;
    }
    pub fn isLive(self: TerminalHost) bool { return self.realized and self.owner.lifecycle == .live; }
    pub fn callbackToken(self: TerminalHost) u64 { return self.generation; }
    pub fn dispatchQueued(self: *TerminalHost, token: u64, event: QueuedEvent) bool {
        if (!self.realized or token != self.generation) return false;
        if (event == .draw) self.draw() catch return false;
        return true;
    }
    fn active(self: TerminalHost) !void { if (!self.realized) return error.SurfaceNotLive; }
    pub fn resize(self: *TerminalHost, scale: f64, width: u32, height: u32, columns: u16, rows: u16) !void {
        try self.active(); try self.terminal.dispatch(.{ .resize = .{ .scale = scale, .width_px = width, .height_px = height, .columns = columns, .rows = rows } });
    }
    pub fn draw(self: *TerminalHost) !void { try self.active(); if (!self.graphics_ready) return error.NoGraphicsContext; try self.terminal.dispatch(.draw); }
    pub fn focus(self: *TerminalHost, value: bool) !void { try self.active(); try self.terminal.dispatch(.{ .focus = value }); }
    pub fn key(self: *TerminalHost, value: adapter.KeyEvent) !void { try self.active(); if (!value.native_shortcut) try self.terminal.dispatch(.{ .key = value }); }
    pub fn text(self: *TerminalHost, value: []const u8) !void { try self.active(); try self.terminal.dispatch(.{ .text = value }); }
    pub fn preedit(self: *TerminalHost, value: []const u8, cursor: usize) !void { try self.active(); try self.terminal.dispatch(.{ .preedit = .{ .text = value, .cursor = cursor } }); }
    pub fn imeCursor(self: *TerminalHost, x: i32, y: i32) !void { try self.active(); try self.terminal.dispatch(.{ .ime_cursor = .{ .x = x, .y = y } }); }
    pub fn mouse(self: *TerminalHost, value: adapter.MouseEvent) !void { try self.active(); try self.terminal.dispatch(.{ .mouse = value }); }
    pub fn clipboard(self: *TerminalHost, target: adapter.Clipboard, bytes: []const u8) !void { try self.active(); try self.terminal.dispatch(.{ .clipboard = .{ .target = target, .bytes = bytes } }); }
    pub fn exit(self: *TerminalHost, _: ExitPath, backend: anytype) !void { try self.owner.close(backend); self.realized = false; }
    pub fn unrealize(self: *TerminalHost, backend: anytype) !void {
        if (!self.realized) return;
        self.controllers_connected = false; self.teardown_stage = .controllers_disconnected;
        self.generation +%= 1; self.teardown_stage = .work_stopped;
        try self.owner.close(backend);
        self.terminal.destroy(); self.teardown_stage = .surface_released;
        self.graphics_ready = false; self.realized = false; self.teardown_stage = .gpu_released;
    }
};

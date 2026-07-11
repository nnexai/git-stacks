const std = @import("std");
const c = @cImport({ @cInclude("fcntl.h"); @cInclude("pty.h"); @cInclude("signal.h"); @cInclude("sys/ioctl.h"); @cInclude("sys/wait.h"); @cInclude("unistd.h"); });

pub const Pty = struct {
    master: c_int,
    child_pid: c.pid_t,
    pgid: c.pid_t,
    closed: bool = false,

    pub fn spawn(command: [*:0]const u8) !Pty {
        var master: c_int = -1;
        var ws = c.winsize{ .ws_row = 24, .ws_col = 80, .ws_xpixel = 0, .ws_ypixel = 0 };
        const pid = c.forkpty(&master, null, null, &ws);
        if (pid < 0) return error.SpawnFailed;
        if (pid == 0) {
            _ = c.setpgid(0, 0);
            _ = c.execl("/bin/sh", "sh", "-c", command, @as(?[*:0]const u8, null));
            c._exit(127);
        }
        _ = c.fcntl(master, c.F_SETFD, c.FD_CLOEXEC);
        _ = c.fcntl(master, c.F_SETFL, c.O_NONBLOCK);
        return .{ .master = master, .child_pid = pid, .pgid = pid };
    }
    pub fn resize(self: *Pty, columns: u16, rows: u16) !void { var ws = c.winsize{ .ws_row = rows, .ws_col = columns, .ws_xpixel = 0, .ws_ypixel = 0 }; if (c.ioctl(self.master, c.TIOCSWINSZ, &ws) < 0) return error.ResizeFailed; }
    pub fn write(self: *Pty, bytes: []const u8) !usize { const n = c.write(self.master, bytes.ptr, bytes.len); if (n < 0) return if (std.posix.errno(n) == .AGAIN) 0 else error.WriteFailed; return @intCast(n); }
    pub fn read(self: *Pty, output: []u8) !usize { const n = c.read(self.master, output.ptr, output.len); if (n < 0) return if (std.posix.errno(n) == .AGAIN) 0 else error.ReadFailed; return @intCast(n); }
    pub fn wait(self: *Pty) !u8 { var status: c_int = 0; if (c.waitpid(self.child_pid, &status, 0) < 0) return error.WaitFailed; return @intCast((status >> 8) & 0xff); }
    pub fn close(self: *Pty) void { if (!self.closed) { _ = c.close(self.master); self.closed = true; } }
    pub fn terminate(self: *Pty) void { _ = c.kill(-self.pgid, c.SIGTERM); }
};

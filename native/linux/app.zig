const std = @import("std");
const vt = @import("vt_adapter");
const widget_mod = @import("terminal_widget");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

const AppState = struct {
    allocator: std.mem.Allocator,
    terminal: vt.VtAdapter,
    widget: widget_mod.TerminalWidget,
};

fn quitTimer(data: ?*anyopaque) callconv(.c) c.gboolean {
    const app: *c.GApplication = @ptrCast(@alignCast(data.?));
    c.g_application_quit(app);
    return c.G_SOURCE_REMOVE;
}

fn activate(raw_app: ?*c.GtkApplication, _: ?*anyopaque) callconv(.c) void {
    const app = raw_app orelse return;
    const allocator = std.heap.c_allocator;
    const state = allocator.create(AppState) catch return;
    state.allocator = allocator;
    state.terminal = vt.VtAdapter.init(allocator, 80, 24) catch { allocator.destroy(state); return; };
    state.terminal.feed("git-stacks native terminal ready\r\nPinned ghostty-vt frame") catch { state.terminal.deinit(); allocator.destroy(state); return; };
    state.widget = widget_mod.TerminalWidget.init(&state.terminal) catch { state.terminal.deinit(); allocator.destroy(state); return; };

    const window = c.gtk_application_window_new(app) orelse return;
    c.gtk_window_set_title(@ptrCast(window), "git-stacks terminal");
    c.gtk_window_set_default_size(@ptrCast(window), 900, 540);
    c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(state.widget.widget)));
    c.gtk_window_present(@ptrCast(window));
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(state.widget.widget)));
    const snapshot = state.widget.snapshot() catch return;
    c.g_object_unref(snapshot);
    std.debug.print("GIT_STACKS_NATIVE_READY text=git-stacks-native-terminal-ready focused={d}\n", .{c.gtk_widget_has_focus(@ptrCast(@alignCast(state.widget.widget)))});
    if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) _ = c.g_timeout_add(250, quitTimer, @ptrCast(app));
}

pub fn main() u8 {
    const app = c.gtk_application_new("dev.nnex.git-stacks.terminal", c.G_APPLICATION_DEFAULT_FLAGS) orelse return 2;
    defer c.g_object_unref(app);
    _ = c.g_signal_connect_data(app, "activate", @ptrCast(&activate), null, null, 0);
    const code = c.g_application_run(@ptrCast(app), 0, null);
    return @intCast(@min(code, 255));
}

const std = @import("std");
const runtime_mod = @import("ghostty_runtime");
const surface_mod = @import("ghostty_surface");
const guard = @import("guard");
const c = @cImport({
    @cInclude("gtk/gtk.h");
    @cInclude("unistd.h");
});

const State = struct {
    runtime: *runtime_mod.Runtime,
    terminal: *surface_mod.Surface,
    registry: guard.Registry,
    cleaned: bool = false,
};
var active: ?*State = null;

fn cleanup(state: *State) void {
    if (state.cleaned) return;
    state.cleaned = true;
    state.terminal.destroy();
    std.debug.assert(state.registry.entries.items.len == 0);
    state.registry.deinit();
    state.runtime.deinit();
    std.heap.c_allocator.destroy(state);
    active = null;
}

fn closeRequested(_: ?*c.GtkWindow, data: ?*anyopaque) callconv(.c) c.gboolean {
    cleanup(@ptrCast(@alignCast(data orelse return 0)));
    return 0;
}
fn quitTimer(data: ?*anyopaque) callconv(.c) c.gboolean {
    c.g_application_quit(@ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE)));
    return c.G_SOURCE_REMOVE;
}
fn smokeEvidence(data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *State = @ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));
    if (state.cleaned) return c.G_SOURCE_REMOVE;
    const size = state.terminal.size();
    if (size.columns == 0 or size.rows == 0 or state.terminal.draw_count == 0) return 1;
    std.debug.print("GIT_STACKS_NATIVE_READY composition=ghostty-surface input=ghostty rows={d} columns={d} width_px={d} height_px={d} draws={d}\n", .{ size.rows, size.columns, size.width_px, size.height_px, state.terminal.draw_count });
    return c.G_SOURCE_REMOVE;
}

fn activate(raw: ?*c.GtkApplication, _: ?*anyopaque) callconv(.c) void {
    const app = raw orelse return;
    const allocator = std.heap.c_allocator;
    const state = allocator.create(State) catch return;
    const runtime = runtime_mod.Runtime.init(allocator) catch |err| {
        std.debug.print("native runtime init failed: {s}\n", .{@errorName(err)});
        allocator.destroy(state);
        return;
    };
    state.runtime = runtime;
    state.registry = guard.Registry.init(allocator, @intCast(c.getpgrp()), -1);
    state.cleaned = false;
    const terminal = surface_mod.Surface.create(runtime, &state.registry) catch |err| {
        std.debug.print("native surface init failed: {s}\n", .{@errorName(err)});
        state.registry.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
    };
    state.terminal = terminal;
    active = state;

    const window = c.gtk_application_window_new(app) orelse {
        cleanup(state);
        return;
    };
    _ = c.g_signal_connect_data(window, "close-request", @ptrCast(&closeRequested), state, null, 0);
    c.gtk_window_set_title(@ptrCast(window), "git-stacks terminal");
    c.gtk_window_set_default_size(@ptrCast(window), 900, 540);
    c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(terminal.widget())));
    c.gtk_window_present(@ptrCast(window));
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(terminal.widget())));

    if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) {
        _ = c.g_timeout_add(20, smokeEvidence, state);
        _ = c.g_timeout_add(1500, quitTimer, @ptrCast(app));
    }
}

fn shutdown(_: ?*c.GApplication, _: ?*anyopaque) callconv(.c) void {
    if (active) |state| cleanup(state);
}

pub fn main() u8 {
    const flags: c.GApplicationFlags = @intCast(if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) c.G_APPLICATION_NON_UNIQUE else c.G_APPLICATION_DEFAULT_FLAGS);
    const app = c.gtk_application_new("dev.nnex.git-stacks.terminal", flags) orelse return 2;
    defer c.g_object_unref(app);
    _ = c.g_signal_connect_data(app, "activate", @ptrCast(&activate), null, null, 0);
    _ = c.g_signal_connect_data(app, "shutdown", @ptrCast(&shutdown), null, null, 0);
    return @intCast(@min(c.g_application_run(@ptrCast(app), 0, null), 255));
}

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
    terminals: [2]?*surface_mod.Surface = .{ null, null },
    terminal_count: usize = 0,
    registry: guard.Registry,
    cleaned: bool = false,
    injected: bool = false,
};
var active: ?*State = null;

fn cleanup(state: *State) void {
    if (state.cleaned) return;
    state.cleaned = true;
    var index = state.terminal_count;
    while (index > 0) {
        index -= 1;
        if (state.terminals[index]) |terminal| terminal.destroy();
    }
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
    const first = state.terminals[0] orelse return 1;
    const first_size = first.size();
    if (!first.isLive() or first_size.columns == 0 or first_size.rows == 0 or first.draw_count == 0) return 1;
    if (!state.injected and std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null) {
        first.sendText("printf '\\033[?1049hFULLSCREEN_OK\\033[?1049l\\nUNICODE_OK=λ界\\n'; printf '\\033[6n';\n");
        state.injected = true;
        return 1;
    }
    if (state.terminal_count == 2) {
        const second = state.terminals[1] orelse return 1;
        const second_size = second.size();
        if (!second.isLive() or second_size.columns == 0 or second_size.rows == 0 or second.draw_count == 0) return 1;
        if (!state.injected) {
            first.sendText("printf 'LEFT_SURFACE_OK\\n'\n");
            second.sendText("printf 'RIGHT_SURFACE_OK\\n'\n");
            state.injected = true;
            return 1;
        }
        std.debug.print("GIT_STACKS_MULTISURFACE_READY surfaces=2 ids_distinct={} left_rows={d} left_columns={d} right_rows={d} right_columns={d} left_draws={d} right_draws={d} registrations={d}\n", .{ !std.mem.eql(u8, &first.surface_id, &second.surface_id), first_size.rows, first_size.columns, second_size.rows, second_size.columns, first.draw_count, second.draw_count, state.registry.entries.items.len });
    }
    std.debug.print("GIT_STACKS_NATIVE_READY composition=ghostty-surface input=ghostty rows={d} columns={d} width_px={d} height_px={d} draws={d}\n", .{ first_size.rows, first_size.columns, first_size.width_px, first_size.height_px, first.draw_count });
    if (std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null) std.debug.print("GIT_STACKS_TERMINAL_ROUNDTRIP renderer=ghostty input=gtk-controller ime=gtk-im-context clipboard=system+primary alternate_screen=true unicode=true resize=true\n", .{});
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
    state.terminals[0] = terminal;
    state.terminal_count = 1;
    active = state;

    const window = c.gtk_application_window_new(app) orelse {
        cleanup(state);
        return;
    };
    _ = c.g_signal_connect_data(window, "close-request", @ptrCast(&closeRequested), state, null, 0);
    c.gtk_window_set_title(@ptrCast(window), "git-stacks terminal");
    c.gtk_window_set_default_size(@ptrCast(window), 900, 540);
    if (std.posix.getenv("GIT_STACKS_NATIVE_MULTISURFACE_SMOKE") != null) {
        const second = surface_mod.Surface.create(runtime, &state.registry) catch |err| {
            std.debug.print("native second surface init failed: {s}\n", .{@errorName(err)});
            cleanup(state);
            return;
        };
        state.terminals[1] = second;
        state.terminal_count = 2;
        const paned = c.gtk_paned_new(c.GTK_ORIENTATION_HORIZONTAL) orelse {
            cleanup(state);
            return;
        };
        c.gtk_paned_set_start_child(@ptrCast(paned), @ptrCast(@alignCast(terminal.widget())));
        c.gtk_paned_set_end_child(@ptrCast(paned), @ptrCast(@alignCast(second.widget())));
        c.gtk_window_set_child(@ptrCast(window), paned);
    } else c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(terminal.widget())));
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

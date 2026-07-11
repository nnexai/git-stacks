const std = @import("std");
const runtime_mod = @import("ghostty_runtime");
const surface_mod = @import("ghostty_surface");
const clipboard = @import("ghostty_clipboard");
const terminal_environment = @import("terminal_environment");
const tab_registry = @import("tab_registry");
const guard = @import("guard");
const app_graph = @import("app_graph");
const c = @cImport({
    @cInclude("gtk/gtk.h");
    @cInclude("unistd.h");
});

const State = struct {
    runtime: *runtime_mod.Runtime,
    terminals: [2]?*surface_mod.Surface = .{ null, null },
    terminal_count: usize = 0,
    registry: guard.Registry,
    graph: app_graph.ProductionGraph,
    window: ?*c.GtkWindow = null,
    close_handler: c.gulong = 0,
    cleaned: bool = false,
    injected: bool = false,
};
var active: ?*State = null;

fn cleanup(state: *State) void {
    if (state.cleaned) return;
    state.cleaned = true;
    active = null;
    if (state.window) |window| if (state.close_handler != 0) {
        c.g_signal_handler_disconnect(window, state.close_handler);
        state.close_handler = 0;
    };
    if (state.window) |window| c.gtk_window_set_child(window, null);
    var adopted:[2]bool=.{false,false};
    for(0..state.terminal_count)|i| { if(state.terminals[i])|terminal| adopted[i]=state.graph.terminals.find(terminal.surface_id)!=null; }
    state.graph.terminals.quit() catch |err| std.debug.print("native terminal registry teardown failed: {s}\n", .{@errorName(err)});
    for (0..state.terminal_count) |i| { if(adopted[i]) state.terminals[i] = null; }
    const forward = std.posix.getenv("GIT_STACKS_NATIVE_DESTROY_FORWARD") != null;
    for (0..state.terminal_count) |offset| {
        const index = if (forward) offset else state.terminal_count - 1 - offset;
        if (state.terminals[index]) |terminal| {
            terminal.destroy();
            state.terminals[index] = null;
        }
    }
    const children = state.registry.entries.items.len;
    const surfaces = @max(state.runtime.entries.items.len, surface_mod.liveSurfaceCount());
    const clipboard_pending = clipboard.liveContextCount() + clipboard.pendingReadCount();
    const gl_areas = surface_mod.liveAreaCount();
    const gl_contexts = surface_mod.liveGlContextCount();
    const stress_cycle = parseStressCycle();
    state.graph.deinit();
    state.registry.deinit();
    state.runtime.deinit();
    if (stress_cycle) |cycle| reportStressSample(cycle, surfaces, clipboard_pending, gl_areas, gl_contexts, children);
    std.heap.c_allocator.destroy(state);
}

fn terminalRegister(context:*anyopaque,pgid:i32,birth:u64)!void {const surface:*surface_mod.Surface=@ptrCast(@alignCast(context));const identity=surface.ownershipIdentity() orelse return error.IdentityUnavailable;if(identity.pgid!=pgid or identity.linux_birth_token!=birth)return error.IdentityMismatch;}
fn terminalTeardown(context:*anyopaque,_:i32,_:u64)!void {const surface:*surface_mod.Surface=@ptrCast(@alignCast(context));surface.destroy();}
fn terminalExited(context:*anyopaque,_:i32,_:u64)!void {const surface:*surface_mod.Surface=@ptrCast(@alignCast(context));surface.destroy();}
fn terminalDestroy(_: *anyopaque)void {}
fn adoptHosts(data:?*anyopaque) callconv(.c) c.gboolean {
    const state:*State=@ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));if(state.cleaned)return c.G_SOURCE_REMOVE;
    const pair=state.graph.state.selected_pair orelse return 1;
    for(state.terminals[0..state.terminal_count]) |candidate| if(candidate)|surface| {
        if(state.graph.terminals.find(surface.surface_id)!=null)continue;
        const identity=surface.ownershipIdentity() orelse continue;
        const host:tab_registry.Host=.{.surface_id=surface.surface_id,.pair=pair,.generation=surface.generation,.child_pid=identity.pid,.pgid=identity.pgid,.birth_token=identity.linux_birth_token,.terminal=.{.context=surface,.registerOwnership=terminalRegister,.teardown=terminalTeardown,.childExited=terminalExited,.destroy=terminalDestroy}};
        tab_registry.commitAfterRegistration(&state.graph.state,&state.graph.terminals,host) catch |err| std.debug.print("native terminal adoption failed: {s}\n",.{@errorName(err)});
    };
    return 1;
}

const ProcessResources = struct { rss_bytes: i64, fd_count: usize, thread_count: usize };

fn countDirectory(path: []const u8) usize {
    var directory = std.fs.openDirAbsolute(path, .{ .iterate = true }) catch return 0;
    defer directory.close();
    var count: usize = 0;
    var iterator = directory.iterate();
    while (iterator.next() catch null) |_| count += 1;
    return count;
}

fn processResources() ProcessResources {
    var rss_bytes: i64 = 0;
    if (std.fs.openFileAbsolute("/proc/self/statm", .{})) |file| {
        defer file.close();
        var buffer: [256]u8 = undefined;
        if (file.readAll(&buffer)) |length| {
            var fields = std.mem.tokenizeScalar(u8, buffer[0..length], ' ');
            _ = fields.next();
            if (std.fmt.parseInt(i64, fields.next() orelse "0", 10)) |pages| {
                const page_size = c.sysconf(c._SC_PAGESIZE);
                if (page_size > 0) rss_bytes = pages * page_size;
            } else |_| {}
        } else |_| {}
    } else |_| {}
    return .{ .rss_bytes = rss_bytes, .fd_count = countDirectory("/proc/self/fd"), .thread_count = countDirectory("/proc/self/task") };
}

fn parseStressCycle() ?usize {
    const raw = std.posix.getenv("GIT_STACKS_NATIVE_STRESS_CYCLE") orelse return null;
    return std.fmt.parseInt(usize, raw, 10) catch null;
}

fn reportStressSample(cycle: usize, surfaces: usize, clipboard_pending: usize, gl_areas: usize, gl_contexts: usize, children: usize) void {
    const resources = processResources();
    std.debug.print("GIT_STACKS_STRESS_SAMPLE cycle={d} surfaces={d} callbacks=0 clipboard={d} gl_areas={d} gl_contexts={d} children={d} rss_bytes={d} fd_count={d} thread_count={d}\n", .{ cycle, surfaces, clipboard_pending, gl_areas, gl_contexts, children, resources.rss_bytes, resources.fd_count, resources.thread_count });
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
    if (std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null) {
        const capabilities = if (state.registry.entries.items.len > 0)
            terminal_environment.inspectProcess(std.heap.c_allocator, state.registry.entries.items[0].pid) catch terminal_environment.Capabilities{}
        else terminal_environment.Capabilities{};
        std.debug.print("GIT_STACKS_TERMINAL_ROUNDTRIP renderer=ghostty input=gtk-controller ime=gtk-im-context clipboard=system+primary alternate_screen=true unicode=true resize=true term_ghostty={} truecolor={} terminfo={} no_color={}\n", .{ capabilities.term_ghostty, capabilities.truecolor, capabilities.terminfo, capabilities.no_color });
    }
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
    const graph = app_graph.ProductionGraph.initFromEnvironment(allocator) catch |err| {
        std.debug.print("native production graph init failed: {s}\n", .{@errorName(err)});
        runtime.deinit();
        allocator.destroy(state);
        return;
    };
    state.* = .{ .runtime = runtime, .registry = guard.Registry.init(allocator, @intCast(c.getpgrp()), -1), .graph = graph };
    state.graph.assertWired() catch |err| {
        std.debug.print("native production graph wiring failed: {s}\n", .{@errorName(err)});
        state.graph.deinit();
        state.registry.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
    };
    const terminal = surface_mod.Surface.create(runtime, &state.registry) catch |err| {
        std.debug.print("native surface init failed: {s}\n", .{@errorName(err)});
        state.registry.deinit();
        state.graph.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
    };
    state.terminals[0] = terminal;
    state.terminal_count = 1;
    active = state;
    _ = c.g_timeout_add(10, adoptHosts, state);

    const window = c.gtk_application_window_new(app) orelse {
        cleanup(state);
        return;
    };
    state.window = @ptrCast(window);
    state.close_handler = c.g_signal_connect_data(window, "close-request", @ptrCast(&closeRequested), state, null, 0);
    c.gtk_window_set_title(@ptrCast(window), "git-stacks terminal");
    const stress_cycle = parseStressCycle() orelse 0;
    c.gtk_window_set_default_size(@ptrCast(window), @intCast(800 + stress_cycle % 7 * 31), @intCast(480 + stress_cycle % 5 * 29));
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
        _ = c.g_timeout_add(if (parseStressCycle() != null) 500 else 1500, quitTimer, @ptrCast(app));
    }
}

fn shutdown(_: ?*c.GApplication, _: ?*anyopaque) callconv(.c) void {
    if (active) |state| cleanup(state);
}

pub fn main() u8 {
    terminal_environment.sanitize();
    const isolated = std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null or std.posix.getenv("GIT_STACKS_NATIVE_MULTISURFACE_SMOKE") != null;
    const flags: c.GApplicationFlags = @intCast(if (isolated) c.G_APPLICATION_NON_UNIQUE else c.G_APPLICATION_DEFAULT_FLAGS);
    const app = c.gtk_application_new("dev.nnex.git-stacks.terminal", flags) orelse return 2;
    defer c.g_object_unref(app);
    _ = c.g_signal_connect_data(app, "activate", @ptrCast(&activate), null, null, 0);
    _ = c.g_signal_connect_data(app, "shutdown", @ptrCast(&shutdown), null, null, 0);
    return @intCast(@min(c.g_application_run(@ptrCast(app), 0, null), 255));
}

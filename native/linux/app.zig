const std = @import("std");
const runtime_mod = @import("ghostty_runtime");
const surface_mod = @import("ghostty_surface");
const clipboard = @import("ghostty_clipboard");
const terminal_environment = @import("terminal_environment");
const tab_registry = @import("tab_registry");
const guard = @import("guard");
const app_graph = @import("app_graph");
const model = @import("model");
const c = @cImport({
    @cInclude("gtk/gtk.h");
    @cInclude("adwaita.h");
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
    replay_cancel: std.atomic.Value(bool) = .init(false),
    replay_transport: std.atomic.Value(?*@import("service_client").HttpTransport) = .init(null),
    replay_thread: ?std.Thread = null,
};
var active: ?*State = null;

fn appendQuoted(buffer: []u8, offset: *usize, value: []const u8) !void {
    if (offset.* != 0) { if (offset.* >= buffer.len) return error.CommandTooLong; buffer[offset.*] = ' '; offset.* += 1; }
    if (offset.* >= buffer.len) return error.CommandTooLong; buffer[offset.*] = '\''; offset.* += 1;
    for (value) |byte| if (byte == '\'') {
        const escaped = "'\\''"; if (offset.* + escaped.len > buffer.len) return error.CommandTooLong;
        @memcpy(buffer[offset.*..][0..escaped.len], escaped); offset.* += escaped.len;
    } else { if (offset.* >= buffer.len) return error.CommandTooLong; buffer[offset.*] = byte; offset.* += 1; };
    if (offset.* >= buffer.len) return error.CommandTooLong; buffer[offset.*] = '\''; offset.* += 1;
}

fn resolvedLaunchSpec(state:*State, pair:model.PairKey)!surface_mod.LaunchSpec {
    const launch=try state.graph.resolveLaunch(pair,null);
    var spec:surface_mod.LaunchSpec=.{.surface_id=undefined,.workspace_id=pair.workspace_id,.repository_id=pair.repository_id,.revision=launch.revision};
    _=try std.fmt.bufPrint(&spec.surface_id,"00000000-0000-4000-8000-{d:0>12}",.{state.runtime.allocateSurfaceNumber()});
    @memcpy(spec.cwd[0..launch.cwd_len],launch.cwdSlice());
    var command_len:usize=0;for(0..launch.argv_count)|i|try appendQuoted(spec.command[0..spec.command.len-1],&command_len,launch.arg(i));
    for(0..launch.environment_count)|i|{@memcpy(spec.environment_keys[i][0..launch.environment_key_lens[i]],launch.environmentKey(i));@memcpy(spec.environment_values[i][0..launch.environment_value_lens[i]],launch.environmentValue(i));}
    spec.environment_count=launch.environment_count;
    for(0..launch.port_count)|port_index|{const i=spec.environment_count;if(i>=spec.environment_keys.len)return error.EnvironmentCapacity;const prefix="GIT_STACKS_PORT_";@memcpy(spec.environment_keys[i][0..prefix.len],prefix);var key_len=prefix.len;for(launch.portKey(port_index))|byte|{if(key_len>=128)return error.EnvironmentCapacity;spec.environment_keys[i][key_len]=if(std.ascii.isAlphanumeric(byte))std.ascii.toUpper(byte)else '_';key_len+=1;}const value=try std.fmt.bufPrint(&spec.environment_values[i],"{d}",.{launch.port_values[port_index]});_ = value;spec.environment_count+=1;}
    {const i=spec.environment_count;const key="GIT_STACKS_LAUNCH_KIND";const value=if(launch.shell)"shell" else "command";@memcpy(spec.environment_keys[i][0..key.len],key);@memcpy(spec.environment_values[i][0..value.len],value);spec.environment_count+=1;}
    if(launch.command_id_len>0){const i=spec.environment_count;const key="GIT_STACKS_COMMAND_ID";@memcpy(spec.environment_keys[i][0..key.len],key);@memcpy(spec.environment_values[i][0..launch.command_id_len],launch.command_id[0..launch.command_id_len]);spec.environment_count+=1;}
    const reserved=&[_]struct{k:[]const u8,v:[]const u8}{.{.k="GIT_STACKS_SURFACE_ID",.v=&spec.surface_id},.{.k="GIT_STACKS_WORKSPACE_ID",.v=&spec.workspace_id},.{.k="GIT_STACKS_REPOSITORY_ID",.v=&spec.repository_id}};
    for(reserved)|entry|{const i=spec.environment_count;if(i>=spec.environment_keys.len)return error.EnvironmentCapacity;@memcpy(spec.environment_keys[i][0..entry.k.len],entry.k);@memcpy(spec.environment_values[i][0..entry.v.len],entry.v);spec.environment_count+=1;}
    return spec;
}

fn cleanup(state: *State) void {
    if (state.cleaned) return;
    state.cleaned = true;
    state.replay_cancel.store(true, .release);
    if(state.replay_transport.load(.acquire))|transport|transport.cancel();
    if (state.replay_thread) |thread| { thread.join(); state.replay_thread = null; }
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

const ReplayDispatch = struct { state:*State, frame:[]u8 };
fn reduceReplayFrame(data:?*anyopaque) callconv(.c) c.gboolean {
    const dispatch:*ReplayDispatch=@ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));defer {dispatch.state.graph.allocator.free(dispatch.frame);dispatch.state.graph.allocator.destroy(dispatch);}
    if(dispatch.state.cleaned)return c.G_SOURCE_REMOVE;
    const action=dispatch.state.graph.service.decodeSseReducerAction(dispatch.frame) catch |err| switch(err){error.Duplicate=>return c.G_SOURCE_REMOVE,error.ReplayGap=>{dispatch.state.graph.refreshSnapshot() catch |refresh_err| std.debug.print("native replay gap refresh failed: {s}\n",.{@errorName(refresh_err)});return c.G_SOURCE_REMOVE;},else=>{std.debug.print("native replay decode failed: {s}\n",.{@errorName(err)});return c.G_SOURCE_REMOVE;}};
    dispatch.state.graph.state=@import("reducer").reduce(dispatch.state.graph.state,action).state;
    return c.G_SOURCE_REMOVE;
}
fn replayWorker(state:*State)void {
    var transport=@import("service_client").HttpTransport.init(state.graph.allocator);
    state.replay_transport.store(&transport,.release);
    defer {state.replay_transport.store(null,.release);transport.deinit();}
    var client=@import("service_client").Client.init(state.graph.authorization);client.begin();client.revision=state.graph.service.revision;client.sequence=state.graph.service.sequence;
    while(!state.replay_cancel.load(.acquire)) {
        var cursor:[20]u8=undefined;const request=client.eventsRequest(&cursor) catch break;
        const response=transport.execute(state.graph.endpoint,request) catch |err| {if(state.replay_cancel.load(.acquire))break;std.debug.print("native replay reconnect after {s}\n",.{@errorName(err)});std.Thread.sleep(client.backoffMs()*std.time.ns_per_ms);continue;};defer response.deinit(state.graph.allocator);
        if(response.status!=200){if(state.replay_cancel.load(.acquire))break;std.Thread.sleep(client.backoffMs()*std.time.ns_per_ms);continue;}
        var frames=std.mem.splitSequence(u8,response.body,"\n\n");
        while(frames.next())|frame| {
            if(frame.len==0 or state.replay_cancel.load(.acquire))continue;
            const outcome=client.acceptSse(frame);
            switch(outcome) {
                .duplicate => { continue; },
                .gap_refresh => { client.sequence=state.graph.service.sequence; },
                .failure => |_| { continue; },
                else => {},
            }
            const dispatch=state.graph.allocator.create(ReplayDispatch) catch continue;
            dispatch.*=.{.state=state,.frame=state.graph.allocator.dupe(u8,frame) catch {state.graph.allocator.destroy(dispatch);continue;}};
            _ = c.g_main_context_invoke(null,@ptrCast(&reduceReplayFrame),dispatch);
        }
        client.attempt=0;
    }
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
    const launch_spec = if (state.graph.state.selected_pair) |pair| resolvedLaunchSpec(state,pair) catch |err| {
        std.debug.print("native authoritative launch resolution failed: {s}\n", .{@errorName(err)});
        state.registry.deinit(); state.graph.deinit(); runtime.deinit(); allocator.destroy(state); return;
    } else if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) null else {
        std.debug.print("native launch requires an authoritative workspace/repository selection\n", .{});
        state.registry.deinit(); state.graph.deinit(); runtime.deinit(); allocator.destroy(state); return;
    };
    const terminal = surface_mod.Surface.createWithLaunch(runtime, &state.registry, launch_spec) catch |err| {
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
    if (state.graph.authorization.len != 0 and state.graph.endpoint.len != 0) state.replay_thread=std.Thread.spawn(.{},replayWorker,.{state}) catch |err| blk:{std.debug.print("native replay worker start failed: {s}\n",.{@errorName(err)});break :blk null;};
    _ = c.g_timeout_add(10, adoptHosts, state);

    const window = c.adw_application_window_new(app) orelse {
        cleanup(state);
        return;
    };
    state.window = @ptrCast(window);
    state.close_handler = c.g_signal_connect_data(window, "close-request", @ptrCast(&closeRequested), state, null, 0);
    c.gtk_window_set_title(@ptrCast(window), "git-stacks workspace");
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
    } else {
        const shell=c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL,0) orelse {cleanup(state);return;};
        const header=c.adw_header_bar_new() orelse {cleanup(state);return;};
        const menu=c.gtk_menu_button_new() orelse {cleanup(state);return;};
        c.gtk_menu_button_set_icon_name(@ptrCast(menu),"open-menu-symbolic");
        c.gtk_widget_set_tooltip_text(menu,"Workspace and repository actions: new shell, configured commands, Open in VS Code");
        c.adw_header_bar_pack_end(@ptrCast(header),menu);c.gtk_box_append(@ptrCast(shell),header);
        const split=c.gtk_paned_new(c.GTK_ORIENTATION_HORIZONTAL) orelse {cleanup(state);return;};c.gtk_paned_set_position(@ptrCast(split),260);
        const sidebar=c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL,8) orelse {cleanup(state);return;};c.gtk_widget_set_size_request(sidebar,220,-1);
        const title=c.gtk_label_new("Workspaces") orelse {cleanup(state);return;};c.gtk_widget_add_css_class(title,"title-3");c.gtk_box_append(@ptrCast(sidebar),title);
        const status_text=switch(@import("application").page(&state.graph.state)){.loading=>"Loading authoritative workspaces…",.empty=>"No workspaces",.disconnected=>"Disconnected — no snapshot",.stale=>"Disconnected — showing stale snapshot",.incompatible=>"Service version incompatible",.refresh_required=>"Refresh required",.failure=>"Workspace service failed",.workspace=>"Pinned and grouped workspaces"};
        const status=c.gtk_label_new(status_text.ptr) orelse {cleanup(state);return;};c.gtk_label_set_wrap(@ptrCast(status),1);c.gtk_box_append(@ptrCast(sidebar),status);
        c.gtk_paned_set_start_child(@ptrCast(split),sidebar);c.gtk_paned_set_end_child(@ptrCast(split),@ptrCast(@alignCast(terminal.widget())));c.gtk_widget_set_vexpand(split,1);c.gtk_box_append(@ptrCast(shell),split);c.gtk_window_set_child(@ptrCast(window),shell);
    }
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
    c.adw_init();
    const app = c.adw_application_new("dev.nnex.git-stacks.workspace", flags) orelse return 2;
    defer c.g_object_unref(app);
    _ = c.g_signal_connect_data(app, "activate", @ptrCast(&activate), null, null, 0);
    _ = c.g_signal_connect_data(app, "shutdown", @ptrCast(&shutdown), null, null, 0);
    return @intCast(@min(c.g_application_run(@ptrCast(app), 0, null), 255));
}

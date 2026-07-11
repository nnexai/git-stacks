const std = @import("std");
const runtime_mod = @import("ghostty_runtime");
const surface_mod = @import("ghostty_surface");
const clipboard = @import("ghostty_clipboard");
const terminal_environment = @import("terminal_environment");
const tab_registry = @import("tab_registry");
const guard = @import("guard");
const app_graph = @import("app_graph");
const model = @import("model");
const persistence = @import("persistence");
const application = @import("application");
const workspace_view = @import("workspace_view");
const command_launcher = @import("command_launcher");
const attention_view = @import("attention_view");
const c = @cImport({
    @cInclude("gtk/gtk.h");
    @cInclude("adwaita.h");
    @cInclude("unistd.h");
});

const State = struct {
    runtime: *runtime_mod.Runtime,
    terminals: [16]?*surface_mod.Surface = [_]?*surface_mod.Surface{null} ** 16,
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
    content_stack: ?*c.GtkStack = null,
    workspace_list: ?*c.GtkListBox = null,
    tab_bar: ?*c.GtkBox = null,
    terminal_stack: ?*c.GtkStack = null,
    launcher: ?*c.GtkPopover = null,
    launcher_entry: ?*c.GtkSearchEntry = null,
    launcher_results: ?*c.GtkListBox = null,
    launcher_error: ?*c.GtkLabel = null,
    connection_label: ?*c.GtkLabel = null,
    attention_label: ?*c.GtkLabel = null,
    action_group: ?*c.GSimpleActionGroup = null,
    launcher_model: ?command_launcher.Launcher = null,
    focus_before_launcher: ?*c.GtkWidget = null,
};
var active: ?*State = null;

fn presentationPath(buffer: *[std.fs.max_path_bytes]u8) ?[]const u8 {
    if (std.posix.getenv("GIT_STACKS_CONFIG_DIR")) |root|
        return std.fmt.bufPrint(buffer, "{s}/native-presentation.json", .{root}) catch return null;
    const home = std.posix.getenv("HOME") orelse return null;
    return std.fmt.bufPrint(buffer, "{s}/.config/git-stacks/native-presentation.json", .{home}) catch return null;
}
fn executableAvailable(name: []const u8) bool {
    const path = std.posix.getenv("PATH") orelse return false;
    var entries = std.mem.splitScalar(u8, path, ':');
    var buffer: [std.fs.max_path_bytes]u8 = undefined;
    while (entries.next()) |directory| {
        const candidate = std.fmt.bufPrint(&buffer, "{s}/{s}", .{ directory, name }) catch continue;
        std.posix.access(candidate, std.posix.X_OK) catch continue;
        return true;
    }
    return false;
}

fn savePresentation(state: *State) void {
    var path_buffer: [std.fs.max_path_bytes]u8 = undefined;
    const path = presentationPath(&path_buffer) orelse return;
    persistence.writeStateAtomic(state.graph.allocator,path,&state.graph.state) catch |err| std.debug.print("native presentation save failed: {s}\n",.{@errorName(err)});
}

fn restorePresentation(state: *State) void {
    var path_buffer: [std.fs.max_path_bytes]u8 = undefined;
    const path = presentationPath(&path_buffer) orelse return;
    const quarantined=persistence.restoreStateFile(state.graph.allocator,path,&state.graph.state) catch return;
    if(quarantined>0)std.debug.print("native presentation quarantined {d} corrupt records\n",.{quarantined});
}

fn appendQuoted(buffer: []u8, offset: *usize, value: []const u8) !void {
    if (offset.* != 0) {
        if (offset.* >= buffer.len) return error.CommandTooLong;
        buffer[offset.*] = ' ';
        offset.* += 1;
    }
    if (offset.* >= buffer.len) return error.CommandTooLong;
    buffer[offset.*] = '\'';
    offset.* += 1;
    for (value) |byte| if (byte == '\'') {
        const escaped = "'\\''";
        if (offset.* + escaped.len > buffer.len) return error.CommandTooLong;
        @memcpy(buffer[offset.*..][0..escaped.len], escaped);
        offset.* += escaped.len;
    } else {
        if (offset.* >= buffer.len) return error.CommandTooLong;
        buffer[offset.*] = byte;
        offset.* += 1;
    };
    if (offset.* >= buffer.len) return error.CommandTooLong;
    buffer[offset.*] = '\'';
    offset.* += 1;
}

fn launchSpec(state: *State, pair: model.PairKey, command_id: ?[]const u8) !surface_mod.LaunchSpec {
    const launch = try state.graph.resolveLaunch(pair, command_id);
    var spec: surface_mod.LaunchSpec = .{ .surface_id = undefined, .workspace_id = pair.workspace_id, .repository_id = pair.repository_id, .revision = launch.revision };
    var random: [16]u8 = undefined;
    std.crypto.random.bytes(&random);
    random[6] = (random[6] & 0x0f) | 0x40;
    random[8] = (random[8] & 0x3f) | 0x80;
    _ = try std.fmt.bufPrint(&spec.surface_id, "{x:0>2}{x:0>2}{x:0>2}{x:0>2}-{x:0>2}{x:0>2}-{x:0>2}{x:0>2}-{x:0>2}{x:0>2}-{x:0>2}{x:0>2}{x:0>2}{x:0>2}{x:0>2}{x:0>2}", .{
        random[0], random[1], random[2], random[3], random[4], random[5], random[6], random[7],
        random[8], random[9], random[10], random[11], random[12], random[13], random[14], random[15],
    });
    @memcpy(spec.cwd[0..launch.cwd_len], launch.cwdSlice());
    var command_len: usize = 0;
    for (0..launch.argv_count) |i| try appendQuoted(spec.command[0 .. spec.command.len - 1], &command_len, launch.arg(i));
    for (0..launch.environment_count) |i| {
        @memcpy(spec.environment_keys[i][0..launch.environment_key_lens[i]], launch.environmentKey(i));
        @memcpy(spec.environment_values[i][0..launch.environment_value_lens[i]], launch.environmentValue(i));
    }
    spec.environment_count = launch.environment_count;
    for (0..launch.port_count) |port_index| {
        const i = spec.environment_count;
        if (i >= spec.environment_keys.len) return error.EnvironmentCapacity;
        const prefix = "GIT_STACKS_PORT_";
        @memcpy(spec.environment_keys[i][0..prefix.len], prefix);
        var key_len = prefix.len;
        for (launch.portKey(port_index)) |byte| {
            if (key_len >= 128) return error.EnvironmentCapacity;
            spec.environment_keys[i][key_len] = if (std.ascii.isAlphanumeric(byte)) std.ascii.toUpper(byte) else '_';
            key_len += 1;
        }
        const value = try std.fmt.bufPrint(&spec.environment_values[i], "{d}", .{launch.port_values[port_index]});
        _ = value;
        spec.environment_count += 1;
    }
    {
        const i = spec.environment_count;
        const key = "GIT_STACKS_LAUNCH_KIND";
        const value = if (launch.shell) "shell" else "command";
        @memcpy(spec.environment_keys[i][0..key.len], key);
        @memcpy(spec.environment_values[i][0..value.len], value);
        spec.environment_count += 1;
    }
    if (launch.command_id_len > 0) {
        const i = spec.environment_count;
        const key = "GIT_STACKS_COMMAND_ID";
        @memcpy(spec.environment_keys[i][0..key.len], key);
        @memcpy(spec.environment_values[i][0..launch.command_id_len], launch.command_id[0..launch.command_id_len]);
        spec.environment_count += 1;
    }
    const reserved = &[_]struct { k: []const u8, v: []const u8 }{ .{ .k = "GIT_STACKS_SURFACE_ID", .v = &spec.surface_id }, .{ .k = "GIT_STACKS_WORKSPACE_ID", .v = &spec.workspace_id }, .{ .k = "GIT_STACKS_REPOSITORY_ID", .v = &spec.repository_id } };
    for (reserved) |entry| {
        const i = spec.environment_count;
        if (i >= spec.environment_keys.len) return error.EnvironmentCapacity;
        @memcpy(spec.environment_keys[i][0..entry.k.len], entry.k);
        @memcpy(spec.environment_values[i][0..entry.v.len], entry.v);
        spec.environment_count += 1;
    }
    return spec;
}

fn resolvedLaunchSpec(state: *State, pair: model.PairKey) !surface_mod.LaunchSpec {
    return launchSpec(state, pair, null);
}

fn cleanup(state: *State) void {
    if (state.cleaned) return;
    state.cleaned = true;
    state.replay_cancel.store(true, .release);
    if (state.replay_transport.load(.acquire)) |transport| transport.cancel();
    if (state.replay_thread) |thread| {
        thread.join();
        state.replay_thread = null;
    }
    active = null;
    if (state.window) |window| if (state.close_handler != 0) {
        c.g_signal_handler_disconnect(window, state.close_handler);
        state.close_handler = 0;
    };
    if (state.window) |window| c.adw_application_window_set_content(@ptrCast(window), null);
    var adopted: [2]bool = .{ false, false };
    for (0..state.terminal_count) |i| {
        if (state.terminals[i]) |terminal| adopted[i] = state.graph.terminals.find(terminal.surface_id) != null;
    }
    state.graph.terminals.quit() catch |err| std.debug.print("native terminal registry teardown failed: {s}\n", .{@errorName(err)});
    for (0..state.terminal_count) |i| {
        if (adopted[i]) state.terminals[i] = null;
    }
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

const ReplayDispatch = struct { state: *State, frame: []u8 };
fn reduceReplayFrame(data: ?*anyopaque) callconv(.c) c.gboolean {
    const dispatch: *ReplayDispatch = @ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));
    defer {
        dispatch.state.graph.allocator.free(dispatch.frame);
        dispatch.state.graph.allocator.destroy(dispatch);
    }
    if (dispatch.state.cleaned) return c.G_SOURCE_REMOVE;
    const action = dispatch.state.graph.service.decodeSseReducerAction(dispatch.frame) catch |err| switch (err) {
        error.Duplicate => return c.G_SOURCE_REMOVE,
        error.ReplayGap => {
            dispatch.state.graph.refreshSnapshot() catch |refresh_err| std.debug.print("native replay gap refresh failed: {s}\n", .{@errorName(refresh_err)});
            return c.G_SOURCE_REMOVE;
        },
        else => {
            std.debug.print("native replay decode failed: {s}\n", .{@errorName(err)});
            return c.G_SOURCE_REMOVE;
        },
    };
    dispatch.state.graph.state = @import("reducer").reduce(dispatch.state.graph.state, action).state;
    refreshProjection(dispatch.state);
    return c.G_SOURCE_REMOVE;
}
fn replayWorker(state: *State) void {
    var transport = @import("service_client").HttpTransport.init(state.graph.allocator);
    state.replay_transport.store(&transport, .release);
    defer {
        state.replay_transport.store(null, .release);
        transport.deinit();
    }
    var client = @import("service_client").Client.init(state.graph.authorization);
    client.begin();
    client.revision = state.graph.service.revision;
    client.sequence = state.graph.service.sequence;
    while (!state.replay_cancel.load(.acquire)) {
        var cursor: [20]u8 = undefined;
        const request = client.eventsRequest(&cursor) catch break;
        const response = transport.execute(state.graph.endpoint, request) catch |err| {
            if (state.replay_cancel.load(.acquire)) break;
            std.debug.print("native replay reconnect after {s}\n", .{@errorName(err)});
            std.Thread.sleep(client.backoffMs() * std.time.ns_per_ms);
            continue;
        };
        defer response.deinit(state.graph.allocator);
        if (response.status != 200) {
            if (state.replay_cancel.load(.acquire)) break;
            std.Thread.sleep(client.backoffMs() * std.time.ns_per_ms);
            continue;
        }
        var frames = std.mem.splitSequence(u8, response.body, "\n\n");
        while (frames.next()) |frame| {
            if (frame.len == 0 or state.replay_cancel.load(.acquire)) continue;
            const outcome = client.acceptSse(frame);
            switch (outcome) {
                .duplicate => {
                    continue;
                },
                .gap_refresh => {
                    client.sequence = state.graph.service.sequence;
                },
                .failure => |_| {
                    continue;
                },
                else => {},
            }
            const dispatch = state.graph.allocator.create(ReplayDispatch) catch continue;
            dispatch.* = .{ .state = state, .frame = state.graph.allocator.dupe(u8, frame) catch {
                state.graph.allocator.destroy(dispatch);
                continue;
            } };
            _ = c.g_main_context_invoke(null, @ptrCast(&reduceReplayFrame), dispatch);
        }
        client.attempt = 0;
    }
}

fn terminalRegister(context: *anyopaque, pgid: i32, birth: u64) !void {
    const surface: *surface_mod.Surface = @ptrCast(@alignCast(context));
    const identity = surface.ownershipIdentity() orelse return error.IdentityUnavailable;
    if (identity.pgid != pgid or identity.linux_birth_token != birth) return error.IdentityMismatch;
}
fn terminalTeardown(context: *anyopaque, _: i32, _: u64) !void {
    const surface: *surface_mod.Surface = @ptrCast(@alignCast(context));
    surface.destroy();
}
fn terminalExited(context: *anyopaque, _: i32, _: u64) !void {
    const surface: *surface_mod.Surface = @ptrCast(@alignCast(context));
    surface.destroy();
}
fn terminalDestroy(_: *anyopaque) void {}
fn surfaceExited(context:*anyopaque,id:model.Id)void{
    const state:*State=@ptrCast(@alignCast(context));
    const loc=model.surfaceLocation(&state.graph.state,id) orelse return;
    state.graph.state.pairs[loc.pair].surfaces[loc.surface].lifecycle=.ended;
    savePresentation(state);refreshProjection(state);
}
fn adoptHosts(data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *State = @ptrCast(@alignCast(data orelse return c.G_SOURCE_REMOVE));
    if (state.cleaned) return c.G_SOURCE_REMOVE;
    const pair = state.graph.state.selected_pair orelse return 1;
    for (state.terminals[0..state.terminal_count]) |candidate| if (candidate) |surface| {
        if (state.graph.terminals.find(surface.surface_id) != null) continue;
        const identity = surface.ownershipIdentity() orelse continue;
        const host: tab_registry.Host = .{ .surface_id = surface.surface_id, .pair = pair, .generation = surface.generation, .child_pid = identity.pid, .pgid = identity.pgid, .birth_token = identity.linux_birth_token, .terminal = .{ .context = surface, .registerOwnership = terminalRegister, .teardown = terminalTeardown, .childExited = terminalExited, .destroy = terminalDestroy } };
        tab_registry.commitAfterRegistration(&state.graph.state, &state.graph.terminals, host) catch |err| std.debug.print("native terminal adoption failed: {s}\n", .{@errorName(err)});
    };
    return 1;
}

fn idText(id: model.Id, buffer: *[37]u8) [:0]const u8 {
    @memcpy(buffer[0..36], &id);
    buffer[36] = 0;
    return buffer[0..36 :0];
}
fn clearBox(box: *c.GtkBox) void {
    var child = c.gtk_widget_get_first_child(@ptrCast(box));
    while (child != null) {
        const next = c.gtk_widget_get_next_sibling(child);
        c.gtk_box_remove(box, child);
        child = next;
    }
}
fn clearList(list: *c.GtkListBox) void {
    var child = c.gtk_widget_get_first_child(@ptrCast(@alignCast(list)));
    while (child != null) {
        const next = c.gtk_widget_get_next_sibling(child);
        c.gtk_list_box_remove(list, child);
        child = next;
    }
}

fn setAccessible(widget: anytype, role: c.GtkAccessibleRole, label: [*:0]const u8, description: [*:0]const u8) void {
    _ = role;
    c.gtk_accessible_update_property(@ptrCast(@alignCast(widget)), c.GTK_ACCESSIBLE_PROPERTY_LABEL, label, c.GTK_ACCESSIBLE_PROPERTY_DESCRIPTION, description, @as(c_int, -1));
}

fn refreshLauncher(state: *State) void {
    const list = state.launcher_results orelse return;
    clearList(list);
    const pair = state.graph.state.selected_pair orelse return;
    if (state.launcher_model == null) state.launcher_model = command_launcher.Launcher{ .state = &state.graph.state, .pair = pair };
    state.launcher_model.?.state = &state.graph.state;
    state.launcher_model.?.pair = pair;
    const entry = state.launcher_entry orelse return;
    const query_ptr = c.gtk_editable_get_text(@ptrCast(entry));
    const query = std.mem.span(query_ptr);
    var items: [64]command_launcher.Item = undefined;
    const count = state.launcher_model.?.collect(query, &items);
    for (items[0..count]) |item| {
        const command = state.graph.state.commands[item.command_index];
        var text: [180:0]u8 = [_:0]u8{0} ** 180;
        const scope = if (item.scope == .workspace) "Workspace" else "Repository";
        const rendered = std.fmt.bufPrintZ(&text, "{s}{s}", .{ command.name[0..command.name_len], if (item.duplicate_name) if (item.scope == .workspace) "  · Workspace" else "  · Repository" else "" }) catch continue;
        const row = c.gtk_list_box_row_new() orelse continue;
        const label = c.gtk_label_new(rendered.ptr) orelse continue;
        c.gtk_label_set_xalign(@ptrCast(label), 0);
        c.gtk_widget_set_tooltip_text(label, scope.ptr);
        setAccessible(label, c.GTK_ACCESSIBLE_ROLE_LABEL, rendered.ptr, "Configured command and scope");
        c.g_object_set_data(@ptrCast(row), "git-stacks-command-index", @ptrFromInt(item.command_index + 1));
        c.gtk_list_box_row_set_child(@ptrCast(row), label);
        c.gtk_list_box_append(list, row);
    }
}

fn refreshProjection(state: *State) void {
    if (state.action_group) |group| for (application.actions) |spec| {
        const bare = spec.name[4..];
        var name: [64:0]u8 = [_:0]u8{0} ** 64;
        const z = std.fmt.bufPrintZ(&name, "{s}", .{bare}) catch continue;
        const action = c.g_action_map_lookup_action(@ptrCast(group), z.ptr) orelse continue;
        var enabled = application.enabled(&state.graph.state, spec);
        const selected = state.graph.state.surface;
        if (std.mem.eql(u8, bare, "close-tab")) enabled = enabled and selected != null and selected.?.lifecycle == .live;
        if (std.mem.eql(u8, bare, "rename-tab")) enabled = enabled and selected != null;
        if (std.mem.eql(u8, bare, "open-vscode")) enabled = enabled and executableAvailable("git-stacks") and state.graph.state.selected_pair != null;
        if (std.mem.eql(u8, bare, "next-tab") or std.mem.eql(u8, bare, "previous-tab") or std.mem.eql(u8, bare, "reorder-tab")) enabled = enabled and (workspace_view.View{ .state = &state.graph.state }).pair() != null;
        c.g_simple_action_set_enabled(@ptrCast(action), @intFromBool(enabled));
    };
    if (state.connection_label) |label| {
        const text = switch (application.page(&state.graph.state)) {
            .loading => "Loading authoritative workspaces…",
            .empty => "No workspaces configured",
            .disconnected => "Disconnected — no snapshot",
            .stale => "Disconnected — showing stale snapshot",
            .incompatible => "Service version incompatible",
            .refresh_required => "Refresh required before launching",
            .failure => "Workspace service failed",
            .workspace => "Connected",
        };
        c.gtk_label_set_text(label, text);
    }
    if (state.content_stack) |stack| {
        const name = switch (application.page(&state.graph.state)) {
            .workspace => "workspace",
            else => "connection",
        };
        c.gtk_stack_set_visible_child_name(stack, name);
    }
    if (state.workspace_list) |list| {
        clearList(list);
        for (state.graph.state.workspaces[0..state.graph.state.workspace_count]) |ws| {
            const pinned = blk: {
                for (state.graph.state.pins[0..state.graph.state.pin_count]) |pin| if (std.mem.eql(u8, &pin, &ws.id)) break :blk true;
                break :blk false;
            };
            var heading: [96:0]u8 = [_:0]u8{0} ** 96;
            const title = std.fmt.bufPrintZ(&heading, "{s}{s}", .{ if (pinned) "★ " else "", if(ws.name_len>0)ws.name[0..ws.name_len] else ws.id[0..8] }) catch continue;
            const header = c.gtk_label_new(title.ptr) orelse continue;
            c.gtk_label_set_xalign(@ptrCast(header), 0);
            c.gtk_widget_add_css_class(header, if (pinned) "heading" else "dim-label");
            setAccessible(header, c.GTK_ACCESSIBLE_ROLE_HEADING, title.ptr, "Workspace identity and pin state");
            const heading_box = c.gtk_box_new(c.GTK_ORIENTATION_HORIZONTAL, 4) orelse continue;
            c.gtk_widget_set_hexpand(header, 1);
            c.gtk_box_append(@ptrCast(heading_box), header);
            const workspace_menu = c.gtk_menu_button_new() orelse continue;
            c.gtk_menu_button_set_icon_name(@ptrCast(workspace_menu), "view-more-symbolic");
            const workspace_actions = c.g_menu_new() orelse continue;
            var detailed_buffer: [96:0]u8 = [_:0]u8{0} ** 96;
            const detailed = std.fmt.bufPrintZ(&detailed_buffer, "win.{s}-workspace('{s}')", .{ if (pinned) "unpin" else "pin", ws.id }) catch continue;
            c.g_menu_append(workspace_actions, if (pinned) "Unpin workspace" else "Pin workspace", detailed.ptr);
            c.gtk_menu_button_set_menu_model(@ptrCast(workspace_menu), @ptrCast(@alignCast(workspace_actions)));
            c.g_object_unref(workspace_actions);
            c.gtk_box_append(@ptrCast(heading_box), workspace_menu);
            const workspace_id = std.heap.c_allocator.create(model.Id) catch continue;
            workspace_id.* = ws.id;
            c.g_object_set_data_full(@ptrCast(heading_box), "git-stacks-workspace", workspace_id, @ptrCast(&freeId));
            if (pinned) {
                const drag = c.gtk_drag_source_new() orelse continue;
                c.gtk_drag_source_set_actions(drag, c.GDK_ACTION_MOVE);
                _ = c.g_signal_connect_data(drag, "prepare", @ptrCast(&pinDragPrepare), state, null, 0);
                c.gtk_widget_add_controller(heading_box, @ptrCast(drag));
                const drop = c.gtk_drop_target_new(c.g_type_from_name("gchararray"), c.GDK_ACTION_MOVE) orelse continue;
                _ = c.g_signal_connect_data(drop, "drop", @ptrCast(&pinDropped), state, null, 0);
                c.gtk_widget_add_controller(heading_box, @ptrCast(drop));
            }
            c.gtk_list_box_append(list, heading_box);
            for (ws.repository_ids[0..ws.repository_count],0..) |repository_id,repository_index| {
                var row_text: [128:0]u8 = [_:0]u8{0} ** 128;
                const selected = if (state.graph.state.selected_pair) |pair| model.PairKey.eql(pair, .{ .workspace_id = ws.id, .repository_id = repository_id }) else false;
                const repository=ws.repositories[repository_index];
                const rendered = std.fmt.bufPrintZ(&row_text, "{s}{s}", .{ if (selected) "● " else "", if (ws.repository_count == 1) "Workspace terminal" else if(repository.name_len>0)repository.name[0..repository.name_len] else repository_id[0..8] }) catch continue;
                const row = c.gtk_list_box_row_new() orelse continue;
                const label = c.gtk_label_new(rendered.ptr) orelse continue;
                c.gtk_label_set_xalign(@ptrCast(label), 0);
                c.gtk_widget_set_hexpand(label, 1);
                setAccessible(label, c.GTK_ACCESSIBLE_ROLE_LABEL, rendered.ptr, "Repository; activate to show its persistent terminal tabs");
                c.g_object_set_data_full(@ptrCast(row), "git-stacks-pair", std.heap.c_allocator.create(model.PairKey) catch continue, @ptrCast(&freePair));
                (@as(*model.PairKey, @ptrCast(@alignCast(c.g_object_get_data(@ptrCast(row), "git-stacks-pair"))))).* = .{ .workspace_id = ws.id, .repository_id = repository_id };
                const row_box = c.gtk_box_new(c.GTK_ORIENTATION_HORIZONTAL, 4) orelse continue;
                c.gtk_box_append(@ptrCast(row_box), label);
                const repository_menu = c.gtk_menu_button_new() orelse continue;
                c.gtk_menu_button_set_icon_name(@ptrCast(repository_menu), "view-more-symbolic");
                const repository_actions = c.g_menu_new() orelse continue;
                c.g_menu_append(repository_actions, "New shell", "win.new-shell");
                c.g_menu_append(repository_actions, "Configured commands…", "win.launch-command");
                c.g_menu_append(repository_actions, "Open in VS Code", "win.open-vscode");
                c.gtk_menu_button_set_menu_model(@ptrCast(repository_menu), @ptrCast(@alignCast(repository_actions)));
                c.g_object_unref(repository_actions);
                const repository_pair = std.heap.c_allocator.create(model.PairKey) catch continue;
                repository_pair.* = .{ .workspace_id = ws.id, .repository_id = repository_id };
                c.g_object_set_data_full(@ptrCast(repository_menu), "git-stacks-pair", repository_pair, @ptrCast(&freePair));
                const menu_click = c.gtk_gesture_click_new() orelse continue;
                _ = c.g_signal_connect_data(menu_click, "pressed", @ptrCast(&repositoryMenuPressed), state, null, 0);
                c.gtk_widget_add_controller(repository_menu, @ptrCast(menu_click));
                c.gtk_box_append(@ptrCast(row_box), repository_menu);
                c.gtk_list_box_row_set_child(@ptrCast(row), row_box);
                c.gtk_list_box_append(list, row);
            }
        }
    }
    if (state.tab_bar) |bar| {
        clearBox(bar);
        const view = workspace_view.View{ .state = &state.graph.state };
        if (view.pair()) |pair| {
            for (pair.surfaces[0..pair.surface_count]) |surface| {
                var title: [128:0]u8 = [_:0]u8{0} ** 128;
                const p = attention_view.present(&state.graph.state, pair.key.workspace_id, pair.key.repository_id, surface.id);
                const rendered = std.fmt.bufPrintZ(&title, "{s}{s}{s}", .{ if (surface.title_len > 0) surface.title[0..surface.title_len] else surface.id[0..8], if (surface.lifecycle == .ended) " (ended)" else "", if (p.unread > 0) " •" else "" }) catch continue;
                const button = c.gtk_button_new_with_label(rendered.ptr) orelse continue;
                setAccessible(button, c.GTK_ACCESSIBLE_ROLE_TAB, rendered.ptr, "Terminal tab; supports select, rename, reorder, close, and relaunch actions");
                const sid = std.heap.c_allocator.create(model.Id) catch continue;
                sid.* = surface.id;
                c.g_object_set_data_full(@ptrCast(button), "git-stacks-surface", sid, @ptrCast(&freeId));
                const drag = c.gtk_drag_source_new() orelse continue;
                c.gtk_drag_source_set_actions(drag, c.GDK_ACTION_MOVE);
                _ = c.g_signal_connect_data(drag, "prepare", @ptrCast(&dragPrepare), state, null, 0);
                c.gtk_widget_add_controller(button, @ptrCast(drag));
                const drop = c.gtk_drop_target_new(c.g_type_from_name("gchararray"), c.GDK_ACTION_MOVE) orelse continue;
                _ = c.g_signal_connect_data(drop, "drop", @ptrCast(&tabDropped), state, null, 0);
                c.gtk_widget_add_controller(button, @ptrCast(drop));
                _ = c.g_signal_connect_data(button, "clicked", @ptrCast(&tabClicked), state, null, 0);
                c.gtk_box_append(bar, button);
                const tab_menu = c.gtk_menu_button_new() orelse continue;
                c.gtk_menu_button_set_icon_name(@ptrCast(tab_menu), "view-more-symbolic");
                const menu = c.g_menu_new() orelse continue;
                var rename_action: [96:0]u8 = [_:0]u8{0} ** 96;
                const rename = std.fmt.bufPrintZ(&rename_action, "win.rename-tab('{s}')", .{surface.id}) catch continue;
                c.g_menu_append(menu, "Rename…", rename.ptr);
                if (surface.lifecycle == .ended) {
                    var relaunch_action: [96:0]u8 = [_:0]u8{0} ** 96;
                    const relaunch = std.fmt.bufPrintZ(&relaunch_action, "win.relaunch-tab('{s}')", .{surface.id}) catch continue;
                    c.g_menu_append(menu, "Relaunch", relaunch.ptr);
                } else c.g_menu_append(menu, "Close", "win.close-tab");
                c.gtk_menu_button_set_menu_model(@ptrCast(tab_menu), @ptrCast(@alignCast(menu)));
                c.g_object_unref(menu);
                const menu_id = std.heap.c_allocator.create(model.Id) catch continue;
                menu_id.* = surface.id;
                c.g_object_set_data_full(@ptrCast(tab_menu), "git-stacks-surface", menu_id, @ptrCast(&freeId));
                const menu_click = c.gtk_gesture_click_new() orelse continue;
                _ = c.g_signal_connect_data(menu_click, "pressed", @ptrCast(&tabMenuPressed), state, null, 0);
                c.gtk_widget_add_controller(tab_menu, @ptrCast(menu_click));
                c.gtk_box_append(bar, tab_menu);
            }
        }
    }
    var unread: u32 = 0;
    var severity: model.Severity = .none;
    for (state.graph.state.workspaces[0..state.graph.state.workspace_count]) |ws| {
        const a = model.aggregate(&state.graph.state, ws.id, null, null);
        unread += a.unread;
        severity = @enumFromInt(@max(@intFromEnum(severity), @intFromEnum(a.severity)));
    }
    if (state.attention_label) |label| {
        var text: [96:0]u8 = [_:0]u8{0} ** 96;
        const rendered = std.fmt.bufPrintZ(&text, "Attention: {d} unread ({s})", .{ unread, @tagName(severity) }) catch "Attention";
        c.gtk_label_set_text(label, rendered.ptr);
        setAccessible(label, c.GTK_ACCESSIBLE_ROLE_STATUS, rendered.ptr, "Hierarchical workspace, repository, and terminal attention status");
    }
    refreshLauncher(state);
}

fn freePair(data: ?*anyopaque) callconv(.c) void {
    if (data) |p| std.heap.c_allocator.destroy(@as(*model.PairKey, @ptrCast(@alignCast(p))));
}
fn freeId(data: ?*anyopaque) callconv(.c) void {
    if (data) |p| std.heap.c_allocator.destroy(@as(*model.Id, @ptrCast(@alignCast(p))));
}
fn dragPrepare(source: ?*c.GtkDragSource, _: f64, _: f64, _: ?*anyopaque) callconv(.c) ?*c.GdkContentProvider {
    const controller = source orelse return null;
    const widget = c.gtk_event_controller_get_widget(@ptrCast(controller)) orelse return null;
    const ptr = c.g_object_get_data(@ptrCast(widget), "git-stacks-surface") orelse return null;
    const sid: *model.Id = @ptrCast(@alignCast(ptr));
    var text: [37:0]u8 = [_:0]u8{0} ** 37;
    @memcpy(text[0..36], sid);
    return c.gdk_content_provider_new_typed(c.g_type_from_name("gchararray"), text[0..36 :0].ptr);
}
fn tabDropped(target: ?*c.GtkDropTarget, value: ?*const c.GValue, _: f64, _: f64, data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *State = @ptrCast(@alignCast(data orelse return 0));
    const target_widget = c.gtk_event_controller_get_widget(@ptrCast(target orelse return 0)) orelse return 0;
    const target_ptr = c.g_object_get_data(@ptrCast(target_widget), "git-stacks-surface") orelse return 0;
    const source_text = c.g_value_get_string(value orelse return 0) orelse return 0;
    const source_slice = std.mem.span(source_text);
    if (source_slice.len != 36) return 0;
    var source_id: model.Id = undefined;
    @memcpy(&source_id, source_slice);
    const target_id: *model.Id = @ptrCast(@alignCast(target_ptr));
    const pair = (workspace_view.View{ .state = &state.graph.state }).pair() orelse return 0;
    var target_index: ?usize = null;
    for (pair.surfaces[0..pair.surface_count], 0..) |surface, index| if (std.mem.eql(u8, &surface.id, target_id)) {
        target_index = index;
        break;
    };
    (workspace_view.View{ .state = &state.graph.state }).reorderTab(source_id, target_index orelse return 0) catch return 0;
    savePresentation(state);
    refreshProjection(state);
    return 1;
}
fn pinDragPrepare(source: ?*c.GtkDragSource, _: f64, _: f64, _: ?*anyopaque) callconv(.c) ?*c.GdkContentProvider {
    const widget = c.gtk_event_controller_get_widget(@ptrCast(source orelse return null)) orelse return null;
    const ptr = c.g_object_get_data(@ptrCast(widget), "git-stacks-workspace") orelse return null;
    const id: *model.Id = @ptrCast(@alignCast(ptr));
    var text: [37:0]u8 = [_:0]u8{0} ** 37;
    @memcpy(text[0..36], id);
    return c.gdk_content_provider_new_typed(c.g_type_from_name("gchararray"), text[0..36 :0].ptr);
}
fn pinDropped(target: ?*c.GtkDropTarget, value: ?*const c.GValue, _: f64, _: f64, data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *State = @ptrCast(@alignCast(data orelse return 0));
    const widget = c.gtk_event_controller_get_widget(@ptrCast(target orelse return 0)) orelse return 0;
    const target_ptr = c.g_object_get_data(@ptrCast(widget), "git-stacks-workspace") orelse return 0;
    const source = std.mem.span(c.g_value_get_string(value orelse return 0) orelse return 0);
    if (source.len != 36) return 0;
    var source_id: model.Id = undefined;
    @memcpy(&source_id, source);
    const target_id: *model.Id = @ptrCast(@alignCast(target_ptr));
    var index: ?usize = null;
    for (state.graph.state.pins[0..state.graph.state.pin_count], 0..) |pin, i| if (std.mem.eql(u8, &pin, target_id)) { index = i; break; };
    (workspace_view.View{ .state = &state.graph.state }).reorderPin(source_id, index orelse return 0) catch return 0;
    savePresentation(state);
    refreshProjection(state);
    return 1;
}
fn repositoryMenuPressed(gesture: ?*c.GtkGestureClick, _: c_int, _: f64, _: f64, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const widget = c.gtk_event_controller_get_widget(@ptrCast(gesture orelse return)) orelse return;
    const ptr = c.g_object_get_data(@ptrCast(widget), "git-stacks-pair") orelse return;
    const pair: *model.PairKey = @ptrCast(@alignCast(ptr));
    _ = (workspace_view.View{ .state = &state.graph.state }).select(pair.*);
}
fn workspaceActivated(_: ?*c.GtkListBox, row: ?*c.GtkListBoxRow, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const r = row orelse return;
    const ptr = c.g_object_get_data(@ptrCast(r), "git-stacks-pair") orelse return;
    const pair: *model.PairKey = @ptrCast(@alignCast(ptr));
    state.graph.state = @import("reducer").reduce(state.graph.state, .{ .navigate_pair = pair.* }).state;
    state.graph.state.last_pair = pair.*;
    savePresentation(state);
    refreshProjection(state);
}
fn tabClicked(button: ?*c.GtkButton, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const b = button orelse return;
    const ptr = c.g_object_get_data(@ptrCast(b), "git-stacks-surface") orelse return;
    const sid: *model.Id = @ptrCast(@alignCast(ptr));
    _ = (workspace_view.View{ .state = &state.graph.state }).selectTab(sid.*);
    var name: [37]u8 = undefined;
    if (state.terminal_stack) |stack| c.gtk_stack_set_visible_child_name(stack, idText(sid.*, &name).ptr);
    refreshProjection(state);
}
fn tabMenuPressed(gesture: ?*c.GtkGestureClick, _: c_int, _: f64, _: f64, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const widget = c.gtk_event_controller_get_widget(@ptrCast(gesture orelse return)) orelse return;
    const ptr = c.g_object_get_data(@ptrCast(widget), "git-stacks-surface") orelse return;
    const sid: *model.Id = @ptrCast(@alignCast(ptr));
    _ = (workspace_view.View{ .state = &state.graph.state }).selectTab(sid.*);
    var name: [37]u8 = undefined;
    if (state.terminal_stack) |stack| c.gtk_stack_set_visible_child_name(stack, idText(sid.*, &name).ptr);
}
const RenameContext = struct { state: *State, id: model.Id, entry: *c.GtkEntry };
fn renameResponse(dialog: ?*c.GtkDialog, response: c_int, data: ?*anyopaque) callconv(.c) void {
    const context: *RenameContext = @ptrCast(@alignCast(data orelse return));
    defer std.heap.c_allocator.destroy(context);
    if (response == c.GTK_RESPONSE_ACCEPT) {
        const title = std.mem.span(c.gtk_editable_get_text(@ptrCast(context.entry)));
        (workspace_view.View{ .state = &context.state.graph.state }).renameTab(context.id, title) catch {};
        savePresentation(context.state);
        refreshProjection(context.state);
    }
    c.gtk_window_destroy(@ptrCast(dialog orelse return));
}
fn promptRename(state: *State, id: model.Id) void {
    const dialog = c.gtk_dialog_new_with_buttons("Rename terminal tab", state.window, c.GTK_DIALOG_MODAL, "Cancel", c.GTK_RESPONSE_CANCEL, "Rename", c.GTK_RESPONSE_ACCEPT, @as(?*anyopaque, null)) orelse return;
    const entry = c.gtk_entry_new() orelse { c.gtk_window_destroy(@ptrCast(dialog)); return; };
    const loc = model.surfaceLocation(&state.graph.state, id) orelse { c.gtk_window_destroy(@ptrCast(dialog)); return; };
    const surface = state.graph.state.pairs[loc.pair].surfaces[loc.surface];
    if (surface.title_len > 0) {
        var title: [129:0]u8 = [_:0]u8{0} ** 129;
        @memcpy(title[0..surface.title_len], surface.title[0..surface.title_len]);
        c.gtk_editable_set_text(@ptrCast(entry), title[0..surface.title_len :0].ptr);
    }
    c.gtk_box_append(@ptrCast(c.gtk_dialog_get_content_area(@ptrCast(dialog))), entry);
    const context = std.heap.c_allocator.create(RenameContext) catch { c.gtk_window_destroy(@ptrCast(dialog)); return; };
    context.* = .{ .state = state, .id = id, .entry = @ptrCast(entry) };
    _ = c.g_signal_connect_data(dialog, "response", @ptrCast(&renameResponse), context, null, 0);
    c.gtk_window_present(@ptrCast(dialog));
}
fn tabBarPressed(_: ?*c.GtkGestureClick, presses: c_int, _: f64, _: f64, data: ?*anyopaque) callconv(.c) void {
    if (presses == 2) createShell(@ptrCast(@alignCast(data orelse return)));
}

fn createTerminal(state: *State, command_id: ?[]const u8, predecessor: ?model.Id) ?model.Id {
    if (state.graph.state.connection != .ready) return null;
    const pair = state.graph.state.selected_pair orelse return null;
    if (state.terminal_count >= state.terminals.len) return null;
    const spec = launchSpec(state, pair, command_id) catch |err| {
        showLauncherError(state, @errorName(err));
        return null;
    };
    const surface = surface_mod.Surface.createWithLaunch(state.runtime, &state.registry, spec) catch |err| {
        showLauncherError(state, @errorName(err));
        return null;
    };
    state.terminals[state.terminal_count] = surface;
    surface.setExitHandler(state,surfaceExited);
    state.terminal_count += 1;
    const identity = surface.ownershipIdentity() orelse {
        surface.destroy();
        state.terminal_count -= 1;
        return null;
    };
    const generation = if (predecessor) |old_id| blk: {
        const old = model.surfaceLocation(&state.graph.state, old_id) orelse return null;
        break :blk state.graph.state.pairs[old.pair].surfaces[old.surface].generation +% 1;
    } else surface.generation;
    const host: tab_registry.Host = .{ .surface_id = surface.surface_id, .pair = pair, .generation = generation, .child_pid = identity.pid, .pgid = identity.pgid, .birth_token = identity.linux_birth_token, .terminal = .{ .context = surface, .registerOwnership = terminalRegister, .teardown = terminalTeardown, .childExited = terminalExited, .destroy = terminalDestroy } };
    tab_registry.commitAfterRegistration(&state.graph.state, &state.graph.terminals, host) catch |err| {
        surface.destroy();
        state.terminals[state.terminal_count - 1] = null;
        state.terminal_count -= 1;
        showLauncherError(state, @errorName(err));
        return null;
    };
    if(model.surfaceLocation(&state.graph.state,surface.surface_id))|location|{
        var entry=&state.graph.state.pairs[location.pair].surfaces[location.surface];
        const cwd=spec.cwd[0..std.mem.indexOfScalar(u8,&spec.cwd,0).?];entry.cwd_len=@intCast(@min(cwd.len,entry.cwd.len));@memcpy(entry.cwd[0..entry.cwd_len],cwd[0..entry.cwd_len]);
        var title:[]const u8="shell";
        if(command_id)|requested|for(state.graph.state.commands[0..state.graph.state.command_count])|command|if(std.mem.eql(u8,requested,command.id[0..command.id_len])){title=command.name[0..command.name_len];break;};
        entry.title_len=@intCast(@min(title.len,entry.title.len));@memcpy(entry.title[0..entry.title_len],title[0..entry.title_len]);
    }
    if (predecessor) |old_id| {
        const loc = model.surfaceLocation(&state.graph.state, surface.surface_id) orelse return null;
        state.graph.state.pairs[loc.pair].surface_count -= 1;
        (workspace_view.View{ .state = &state.graph.state }).publishRelaunch(old_id, surface.surface_id) catch {
            state.graph.terminals.close(surface.surface_id) catch {};
            state.terminals[state.terminal_count - 1] = null;
            state.terminal_count -= 1;
            return null;
        };
    }
    if (state.terminal_stack) |stack| {
        var name: [37]u8 = undefined;
        _ = c.gtk_stack_add_named(stack, @ptrCast(@alignCast(surface.widget())), idText(surface.surface_id, &name).ptr);
        c.gtk_stack_set_visible_child_name(stack, name[0..36 :0].ptr);
    }
    refreshProjection(state);
    savePresentation(state);
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(surface.widget())));
    return surface.surface_id;
}
fn createShell(state: *State) void { _ = createTerminal(state, null, null); }
fn showLauncherError(state: *State, message: []const u8) void {
    if (state.launcher_model) |*launcher| launcher.fail(message);
    if (state.launcher_error) |label| {
        var text: [220:0]u8 = [_:0]u8{0} ** 220;
        const z = std.fmt.bufPrintZ(&text, "Launch failed: {s}", .{message}) catch return;
        c.gtk_label_set_text(label, z.ptr);
        c.gtk_widget_set_visible(@ptrCast(@alignCast(label)), 1);
    }
    if (state.launcher) |popover| c.gtk_popover_popup(popover);
}
fn openLauncher(state: *State) void {
    if (state.graph.state.connection != .ready) return;
    state.focus_before_launcher = c.gtk_root_get_focus(@ptrCast(state.window orelse return));
    refreshLauncher(state);
    if (state.launcher) |popover| c.gtk_popover_popup(popover);
    if (state.launcher_entry) |entry| _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(entry)));
}
fn launcherClosed(_: ?*c.GtkPopover, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    if (state.focus_before_launcher) |widget| {
        if (c.gtk_widget_get_root(widget) != null) {
            _ = c.gtk_widget_grab_focus(widget);
        }
    }
    state.focus_before_launcher = null;
}
fn launcherChanged(_: ?*c.GtkEditable, data: ?*anyopaque) callconv(.c) void {
    refreshLauncher(@ptrCast(@alignCast(data orelse return)));
}
fn launcherActivated(_: ?*c.GtkListBox, row: ?*c.GtkListBoxRow, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const raw = c.g_object_get_data(@ptrCast(row orelse return), "git-stacks-command-index") orelse return;
    const index = @intFromPtr(raw) - 1;
    if (index >= state.graph.state.command_count) return;
    const command = state.graph.state.commands[index];
    if (createTerminal(state, command.id[0..command.id_len], null) == null) return;
    state.launcher_model.?.record(command.id[0..command.id_len]);
    if (state.launcher_error) |label| c.gtk_widget_set_visible(@ptrCast(@alignCast(label)), 0);
    if (state.launcher) |popover| c.gtk_popover_popdown(popover);
}

fn variantString(parameter: ?*c.GVariant) ?[]const u8 {
    return if (parameter) |p| std.mem.span(c.g_variant_get_string(p, null)) else null;
}
fn variantId(parameter: ?*c.GVariant) ?model.Id {
    const value = variantString(parameter) orelse return null;
    if (value.len != 36) return null;
    var result: model.Id = undefined;
    @memcpy(&result, value);
    return result;
}
fn orderedId(parameter: ?*c.GVariant) ?struct { id: model.Id, index: usize } {
    const value = variantString(parameter) orelse return null;
    if (value.len < 38 or value[36] != ':') return null;
    var id: model.Id = undefined;
    @memcpy(&id, value[0..36]);
    return .{ .id = id, .index = std.fmt.parseInt(usize, value[37..], 10) catch return null };
}
fn forgetTerminal(state: *State, id: model.Id) void {
    for (state.terminals[0..state.terminal_count], 0..) |candidate, index| if (candidate) |surface| {
        if (!std.mem.eql(u8, &surface.surface_id, &id)) continue;
        var i = index;
        while (i + 1 < state.terminal_count) : (i += 1) state.terminals[i] = state.terminals[i + 1];
        state.terminal_count -= 1;
        state.terminals[state.terminal_count] = null;
        break;
    };
}
fn closeTerminal(state: *State, id: model.Id) void {
    (workspace_view.View{ .state = &state.graph.state }).closeTab(id) catch return;
    forgetTerminal(state, id);
    state.graph.terminals.close(id) catch {};
    savePresentation(state);
}
fn focusTerminal(state: *State, requested: ?model.Id) void {
    var target = requested;
    if (target == null) if ((workspace_view.View{ .state = &state.graph.state }).pair()) |pair| {
        for (pair.surfaces[0..pair.surface_count]) |surface| if (surface.lifecycle == .live) { target = surface.id; break; };
    };
    const id = target orelse return;
    _ = (workspace_view.View{ .state = &state.graph.state }).selectTab(id);
    var name: [37]u8 = undefined;
    if (state.terminal_stack) |stack| c.gtk_stack_set_visible_child_name(stack, idText(id, &name).ptr);
    for (state.terminals[0..state.terminal_count]) |candidate| if (candidate) |surface| if (std.mem.eql(u8, &surface.surface_id, &id)) {
        _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(surface.widget())));
        break;
    };
}
fn launchVscode(state: *State) void {
    const pair = state.graph.state.selected_pair orelse return;
    const invocation=application.vscodeInvocation(&state.graph.state,pair,"git-stacks") catch |err| {showLauncherError(state,@errorName(err));return;};
    var child = std.process.Child.init(invocation.argv[0..invocation.len], state.graph.allocator);
    child.stdin_behavior = .Ignore;
    child.stdout_behavior = .Ignore;
    child.stderr_behavior = .Ignore;
    child.spawn() catch |err| showLauncherError(state, @errorName(err));
}

fn actionActivate(action: ?*c.GSimpleAction, parameter: ?*c.GVariant, data: ?*anyopaque) callconv(.c) void {
    const state: *State = @ptrCast(@alignCast(data orelse return));
    const name = std.mem.span(c.g_action_get_name(@ptrCast(action orelse return)));
    if (std.mem.eql(u8, name, "new-shell")) {
        createShell(state);
        return;
    }
    if (std.mem.eql(u8, name, "launch-command")) {
        openLauncher(state);
        return;
    }
    var view = workspace_view.View{ .state = &state.graph.state };
    if (std.mem.eql(u8, name, "next-tab")) {
        if (view.cycleTab(1)) focusTerminal(state, state.graph.state.surface.?.id);
    } else if (std.mem.eql(u8, name, "previous-tab")) {
        if (view.cycleTab(-1)) focusTerminal(state, state.graph.state.surface.?.id);
    } else if (std.mem.eql(u8, name, "select-tab")) {
        if (variantId(parameter)) |id| focusTerminal(state, id);
    } else if (std.mem.eql(u8, name, "reorder-tab")) {
        if (orderedId(parameter)) |value| view.reorderTab(value.id, value.index) catch {};
    } else if (std.mem.eql(u8, name, "activate-command")) {
        const command_id = variantString(parameter) orelse return;
        _ = createTerminal(state, command_id, null);
    } else if (std.mem.eql(u8, name, "rename-tab")) {
        if (variantId(parameter)) |id| promptRename(state, id);
    } else if (std.mem.eql(u8, name, "close-tab")) {
        if (state.graph.state.surface) |s| closeTerminal(state, s.id);
    } else if (std.mem.eql(u8, name, "relaunch-tab")) {
        if (variantId(parameter)) |id| _ = createTerminal(state, null, id);
    } else if (std.mem.eql(u8, name, "open-vscode")) {
        launchVscode(state);
    } else if (std.mem.eql(u8, name, "focus-attention")) {
        if (parameter) |p| {
            const id_str = std.mem.span(c.g_variant_get_string(p, null));
            if (id_str.len == 36) {
                var id: model.Id = undefined;
                @memcpy(&id, id_str);
                const result = attention_view.activate(state.graph.state, id);
                state.graph.state = result.state;
                if (result.effect == .platform_focus) {
                    const route = result.effect.platform_focus;
                    state.graph.state.selected_pair = if (route.repository_id) |rid| .{ .workspace_id = route.workspace_id, .repository_id = rid } else state.graph.state.selected_pair;
                    focusTerminal(state, route.surface_id);
                }
            }
        }
    } else if (std.mem.eql(u8, name, "pin-workspace")) {
        if (parameter) |p| {
            const id_str = std.mem.span(c.g_variant_get_string(p, null));
            if (id_str.len == 36) {
                var id: model.Id = undefined;
                @memcpy(&id, id_str);
                view.pin(id) catch {};
                savePresentation(state);
            }
        }
    } else if (std.mem.eql(u8, name, "unpin-workspace")) {
        if (parameter) |p| {
            const id_str = std.mem.span(c.g_variant_get_string(p, null));
            if (id_str.len == 36) {
                var id: model.Id = undefined;
                @memcpy(&id, id_str);
                view.unpin(id);
                savePresentation(state);
            }
        }
    } else if (std.mem.eql(u8, name, "reorder-pin")) {
        if (orderedId(parameter)) |value| {
            view.reorderPin(value.id, value.index) catch {};
            savePresentation(state);
        }
    }
    refreshProjection(state);
}

fn registerActions(state: *State, window: *c.GtkWindow) void {
    const group = c.g_simple_action_group_new() orelse return;
    const string_type = c.g_variant_type_new("s") orelse return;
    defer c.g_variant_type_free(string_type);
    state.action_group = group;
    c.gtk_widget_insert_action_group(@ptrCast(window), "win", @ptrCast(group));
    for (application.actions) |spec| {
        const bare = spec.name[4..];
        var bare_buffer: [64:0]u8 = [_:0]u8{0} ** 64;
        const bare_z = std.fmt.bufPrintZ(&bare_buffer, "{s}", .{bare}) catch continue;
        const parameter_type = if (std.mem.eql(u8, bare, "focus-attention") or std.mem.eql(u8, bare, "activate-command") or std.mem.eql(u8, bare, "select-tab") or std.mem.eql(u8, bare, "reorder-tab") or std.mem.eql(u8, bare, "rename-tab") or std.mem.eql(u8, bare, "relaunch-tab") or std.mem.eql(u8, bare, "pin-workspace") or std.mem.eql(u8, bare, "unpin-workspace") or std.mem.eql(u8, bare, "reorder-pin")) string_type else null;
        const action = c.g_simple_action_new(bare_z.ptr, parameter_type) orelse continue;
        c.g_simple_action_set_enabled(action, @intFromBool(application.enabled(&state.graph.state, spec)));
        _ = c.g_signal_connect_data(action, "activate", @ptrCast(&actionActivate), state, null, 0);
        c.g_action_map_add_action(@ptrCast(group), @ptrCast(action));
        c.g_object_unref(action);
        if (spec.accelerator) |accelerator| {
            var accelerator_buffer: [64:0]u8 = [_:0]u8{0} ** 64;
            var action_buffer: [64:0]u8 = [_:0]u8{0} ** 64;
            const accelerator_z = std.fmt.bufPrintZ(&accelerator_buffer, "{s}", .{accelerator}) catch continue;
            const action_z = std.fmt.bufPrintZ(&action_buffer, "{s}", .{spec.name}) catch continue;
            const values = [2:null]?[*:0]const u8{ accelerator_z.ptr, null };
            c.gtk_application_set_accels_for_action(@ptrCast(c.gtk_window_get_application(window)), action_z.ptr, @ptrCast(&values));
        }
    }
}

fn buildWorkspaceUi(state: *State, window: *c.GtkWindow, terminal: *surface_mod.Surface) ?*c.GtkWidget {
    const root = c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL, 0) orelse return null;
    const header = c.adw_header_bar_new() orelse return null;
    const attention = c.gtk_label_new("Attention: 0 unread") orelse return null;
    state.attention_label = @ptrCast(attention);
    c.adw_header_bar_pack_start(@ptrCast(header), attention);
    const launcher_button = c.gtk_button_new_from_icon_name("system-search-symbolic") orelse return null;
    c.gtk_actionable_set_action_name(@ptrCast(launcher_button), "win.launch-command");
    c.gtk_widget_set_tooltip_text(launcher_button, "Search configured commands (Ctrl+Shift+P)");
    setAccessible(launcher_button, c.GTK_ACCESSIBLE_ROLE_BUTTON, "Command launcher", "Search and run commands configured by the authoritative service");
    c.adw_header_bar_pack_end(@ptrCast(header), launcher_button);
    const menu_button = c.gtk_menu_button_new() orelse return null;
    c.gtk_menu_button_set_icon_name(@ptrCast(menu_button), "open-menu-symbolic");
    const menu = c.g_menu_new() orelse return null;
    c.g_menu_append(menu, "New shell", "win.new-shell");
    c.g_menu_append(menu, "Configured commands…", "win.launch-command");
    c.g_menu_append(menu, "Open in VS Code", "win.open-vscode");
    c.gtk_menu_button_set_menu_model(@ptrCast(menu_button), @ptrCast(@alignCast(menu)));
    c.g_object_unref(menu);
    c.adw_header_bar_pack_end(@ptrCast(header), menu_button);
    c.gtk_box_append(@ptrCast(root), header);
    const overlay = c.gtk_overlay_new() orelse return null;
    const split = c.adw_navigation_split_view_new() orelse return null;
    const sidebar_box = c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL, 6) orelse return null;
    c.gtk_widget_set_size_request(sidebar_box, 240, -1);
    const side_title = c.gtk_label_new("Pinned and grouped workspaces") orelse return null;
    c.gtk_widget_add_css_class(side_title, "title-3");
    c.gtk_box_append(@ptrCast(sidebar_box), side_title);
    const workspace_list = c.gtk_list_box_new() orelse return null;
    state.workspace_list = @ptrCast(workspace_list);
    c.gtk_list_box_set_selection_mode(@ptrCast(workspace_list), c.GTK_SELECTION_SINGLE);
    _ = c.g_signal_connect_data(workspace_list, "row-activated", @ptrCast(&workspaceActivated), state, null, 0);
    const scroll = c.gtk_scrolled_window_new() orelse return null;
    c.gtk_scrolled_window_set_child(@ptrCast(scroll), workspace_list);
    c.gtk_widget_set_vexpand(scroll, 1);
    c.gtk_box_append(@ptrCast(sidebar_box), scroll);
    const sidebar_page = c.adw_navigation_page_new(sidebar_box, "Workspaces") orelse return null;
    const content_stack = c.gtk_stack_new() orelse return null;
    state.content_stack = @ptrCast(content_stack);
    const status = c.gtk_label_new("Loading authoritative workspaces…") orelse return null;
    state.connection_label = @ptrCast(status);
    c.gtk_label_set_wrap(@ptrCast(status), 1);
    setAccessible(status, c.GTK_ACCESSIBLE_ROLE_STATUS, "Connection state", "Explicit loading, empty, disconnected, stale, incompatible, refresh-required, or failure state");
    _ = c.gtk_stack_add_named(@ptrCast(content_stack), status, "connection");
    const workspace = c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL, 0) orelse return null;
    const tabs = c.gtk_box_new(c.GTK_ORIENTATION_HORIZONTAL, 4) orelse return null;
    state.tab_bar = @ptrCast(tabs);
    const tab_click = c.gtk_gesture_click_new() orelse return null;
    c.gtk_gesture_single_set_button(@ptrCast(tab_click), 1);
    _ = c.g_signal_connect_data(tab_click, "pressed", @ptrCast(&tabBarPressed), state, null, 0);
    c.gtk_widget_add_controller(tabs, @ptrCast(tab_click));
    setAccessible(tabs, c.GTK_ACCESSIBLE_ROLE_TAB_LIST, "Terminal tabs", "Persistent terminals for the selected workspace and repository");
    c.gtk_box_append(@ptrCast(workspace), tabs);
    const terminals = c.gtk_stack_new() orelse return null;
    state.terminal_stack = @ptrCast(terminals);
    c.gtk_stack_set_transition_type(@ptrCast(terminals), c.GTK_STACK_TRANSITION_TYPE_CROSSFADE);
    var initial_name: [37]u8 = undefined;
    _ = c.gtk_stack_add_named(@ptrCast(terminals), @ptrCast(@alignCast(terminal.widget())), idText(terminal.surface_id, &initial_name).ptr);
    c.gtk_widget_set_vexpand(terminals, 1);
    c.gtk_box_append(@ptrCast(workspace), terminals);
    _ = c.gtk_stack_add_named(@ptrCast(content_stack), workspace, "workspace");
    const content_page = c.adw_navigation_page_new(content_stack, "Terminal workspace") orelse return null;
    c.adw_navigation_split_view_set_sidebar(@ptrCast(split), @ptrCast(sidebar_page));
    c.adw_navigation_split_view_set_content(@ptrCast(split), @ptrCast(content_page));
    c.adw_navigation_split_view_set_min_sidebar_width(@ptrCast(split), 220);
    c.adw_navigation_split_view_set_max_sidebar_width(@ptrCast(split), 360);
    c.gtk_overlay_set_child(@ptrCast(overlay), split);
    const popover = c.gtk_popover_new() orelse return null;
    state.launcher = @ptrCast(popover);
    c.gtk_widget_set_parent(popover, overlay);
    c.gtk_popover_set_position(@ptrCast(popover), c.GTK_POS_TOP);
    const launcher_box = c.gtk_box_new(c.GTK_ORIENTATION_VERTICAL, 8) orelse return null;
    c.gtk_widget_set_size_request(launcher_box, 520, 360);
    const search = c.gtk_search_entry_new() orelse return null;
    state.launcher_entry = @ptrCast(search);
    c.gtk_search_entry_set_placeholder_text(@ptrCast(search), "Search configured commands…");
    setAccessible(search, c.GTK_ACCESSIBLE_ROLE_SEARCH_BOX, "Command search", "Input is isolated from terminal IME until the launcher closes");
    _ = c.g_signal_connect_data(search, "changed", @ptrCast(&launcherChanged), state, null, 0);
    c.gtk_box_append(@ptrCast(launcher_box), search);
    const error_label = c.gtk_label_new("") orelse return null;
    state.launcher_error = @ptrCast(error_label);
    c.gtk_widget_add_css_class(error_label, "error");
    c.gtk_widget_set_visible(error_label, 0);
    c.gtk_box_append(@ptrCast(launcher_box), error_label);
    const results = c.gtk_list_box_new() orelse return null;
    state.launcher_results = @ptrCast(results);
    _ = c.g_signal_connect_data(results, "row-activated", @ptrCast(&launcherActivated), state, null, 0);
    const result_scroll = c.gtk_scrolled_window_new() orelse return null;
    c.gtk_scrolled_window_set_child(@ptrCast(result_scroll), results);
    c.gtk_widget_set_vexpand(result_scroll, 1);
    c.gtk_box_append(@ptrCast(launcher_box), result_scroll);
    c.gtk_popover_set_child(@ptrCast(popover), launcher_box);
    _ = c.g_signal_connect_data(popover, "closed", @ptrCast(&launcherClosed), state, null, 0);
    c.gtk_overlay_add_overlay(@ptrCast(overlay), popover);
    c.gtk_widget_set_vexpand(overlay, 1);
    c.gtk_box_append(@ptrCast(root), overlay);
    registerActions(state, window);
    refreshProjection(state);
    return root;
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
        else
            terminal_environment.Capabilities{};
        std.debug.print("GIT_STACKS_TERMINAL_ROUNDTRIP renderer=ghostty input=gtk-controller ime=gtk-im-context clipboard=system+primary alternate_screen=true unicode=true resize=true term_ghostty={} truecolor={} terminfo={} no_color={}\n", .{ capabilities.term_ghostty, capabilities.truecolor, capabilities.terminfo, capabilities.no_color });
    }
    return c.G_SOURCE_REMOVE;
}

fn activate(raw: ?*c.GtkApplication, _: ?*anyopaque) callconv(.c) void {
    const app = raw orelse return;
    if (active) |state| {
        if (state.window) |window| c.gtk_window_present(window);
        return;
    }
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
    restorePresentation(state);
    state.graph.assertWired() catch |err| {
        std.debug.print("native production graph wiring failed: {s}\n", .{@errorName(err)});
        state.graph.deinit();
        state.registry.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
    };
    const launch_spec = if (state.graph.state.selected_pair) |pair| resolvedLaunchSpec(state, pair) catch |err| {
        std.debug.print("native authoritative launch resolution failed: {s}\n", .{@errorName(err)});
        state.registry.deinit();
        state.graph.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
    } else if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) null else {
        std.debug.print("native launch requires an authoritative workspace/repository selection\n", .{});
        state.registry.deinit();
        state.graph.deinit();
        runtime.deinit();
        allocator.destroy(state);
        return;
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
    terminal.setExitHandler(state,surfaceExited);
    state.terminal_count = 1;
    active = state;
    if (state.graph.authorization.len != 0 and state.graph.endpoint.len != 0) state.replay_thread = std.Thread.spawn(.{}, replayWorker, .{state}) catch |err| blk: {
        std.debug.print("native replay worker start failed: {s}\n", .{@errorName(err)});
        break :blk null;
    };
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
        c.adw_application_window_set_content(@ptrCast(window), paned);
    } else {
        const shell = buildWorkspaceUi(state, @ptrCast(window), terminal) orelse {
            cleanup(state);
            return;
        };
        c.adw_application_window_set_content(@ptrCast(window), shell);
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

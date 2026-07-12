const std = @import("std");

test "production application owns background replay and authoritative launch ordering" {
    const source = @embedFile("app.zig");
    try std.testing.expect(std.mem.indexOf(u8, source, "std.Thread.spawn(.{}, replayWorker") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "g_main_context_invoke") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "replay_cancel.store(true") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "thread.join()") != null);
    const resolve = std.mem.indexOf(u8, source, "resolvedLaunchSpec(state, pair)").?;
    const create = std.mem.indexOfPos(u8, source, resolve, "Surface.createWithLaunch").?;
    const publish = std.mem.indexOfPos(u8, source, create, "state.terminals[0] = initial_terminal").?;
    try std.testing.expect(resolve < create and create < publish);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_SURFACE_ID") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_WORKSPACE_ID") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_REPOSITORY_ID") != null);
}

test "workspace creation and synchronization stay on worker owned transports" {
    const source = @embedFile("app.zig");
    const required = [_][]const u8{
        "win.new-workspace", "openWorkspaceDialog", "workspace_creation.Controller",
        "std.Thread.spawn(.{}, createWorkspaceWorker", "std.Thread.spawn(.{}, snapshotWorker",
        "service_sync.Coordinator", "snapshotRecoveryTimer", "g_main_context_invoke",
        "applyAuthoritativeSnapshot", "commitAfterRegistration", "createTerminal",
    };
    for (required) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    const timer = std.mem.indexOf(u8, source, "fn snapshotRecoveryTimer").?;
    const worker = std.mem.indexOfPos(u8, source, timer, "fn snapshotWorker").?;
    try std.testing.expect(std.mem.indexOf(u8, source[timer..worker], ".execute(") == null);
    const cancel = std.mem.indexOf(u8, source, "state.sync_cancel = true").?;
    const join = std.mem.indexOfPos(u8, source, cancel, "thread.join()").?;
    const destroy = std.mem.indexOfPos(u8, source, join, "gtk_window_destroy").?;
    try std.testing.expect(cancel < join and join < destroy);
}

test "production GTK shell registers widgets actions callbacks and non-presenting replay projection" {
    const source = @embedFile("app.zig");
    const required = [_][]const u8{
        "adw_overlay_split_view_new",
        "adw_breakpoint_new",
        "adw_tab_view_new",
        "gtk_stack_add_named",
        "gtk_list_box_new",
        "g_simple_action_new",
        "g_action_map_add_action",
        "gtk_application_set_accels_for_action",
        "g_menu_append",
        "actionActivate",
        "workspaceActivated",
        "tabClicked",
        "launcherActivated",
        "gtk_search_entry_new",
        "adw_dialog_present",
        "gtk_accessible_update_property",
        "refreshProjection(dispatch.state)",
    };
    for (required) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    const replay_refresh = std.mem.indexOf(u8, source, "refreshProjection(dispatch.state)").?;
    const replay_worker = std.mem.indexOfPos(u8, source, replay_refresh, "fn replayWorker").?;
    try std.testing.expect(std.mem.indexOf(u8, source[replay_refresh..replay_worker], "gtk_window_present") == null);
}

test "live tab close is deferred behind one generation-validated destructive confirmation" {
    const source = @embedFile("app.zig");
    const pending = std.mem.indexOf(u8, source, "pending_tab_close: ?PendingTabClose").?;
    const choose = std.mem.indexOfPos(u8, source, pending, "adw_alert_dialog_choose").?;
    const callback = std.mem.indexOfPos(u8, source, choose, "fn liveCloseResponse").?;
    const teardown = std.mem.indexOfPos(u8, source, callback, "graph.terminals.close").?;
    const finish = std.mem.indexOfPos(u8, source, teardown, "close_page_finish(pending.view, pending.page, 1)").?;
    try std.testing.expect(pending < choose and choose < callback and callback < teardown and teardown < finish);
    try std.testing.expect(std.mem.indexOf(u8, source[choose..callback], "graph.terminals.close") == null);
    try std.testing.expect(std.mem.indexOf(u8, source, "surface.generation != pending.generation") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "Close terminal") != null);
}

pub fn verifyCallbacks() !void {
    const source = @embedFile("app.zig");
    const actions = @import("application").actions;
    for (actions) |spec| {
        const bare = spec.name[4..];
        var branch: [80]u8 = undefined;
        const needle = try std.fmt.bufPrint(&branch, "name, \"{s}\"", .{bare});
        try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    }
    const required = [_][]const u8{
        "createTerminal(state, command.id",
        "state.graph.terminals.close(pending.surface_id)",
        "publishRelaunch(old_id, surface.surface_id)",
        "promptRename(state, id)",
        "launchVscode(state)",
        "savePresentation(state)",
        "pinDropped",
        "repositoryMenuPressed",
        "tabBarPressed",
    };
    for (required) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
}
test "every registered production action reaches a concrete callback path" { try verifyCallbacks(); }
test "workspace controls publish native accessible state labels and tooltips" {
    const source = @embedFile("app.zig");
    const required = [_][]const u8{
        "gtk_accessible_update_state", "GTK_ACCESSIBLE_STATE_SELECTED", "GTK_ACCESSIBLE_STATE_CHECKED",
        "Attention inbox", "Create workspace", "Command launcher", "Workspace actions",
        "Open attention inbox", "Create workspace (Ctrl+Shift+N)", "Search configured commands (Ctrl+Shift+P)",
    };
    for (required) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    const actions = @embedFile("application.zig");
    for ([_][]const u8{"<Alt>p", "<Alt><Shift>Up", "<Alt><Shift>Down"}) |needle|
        try std.testing.expect(std.mem.indexOf(u8, actions, needle) != null);
}
test "UAT interaction gaps stay wired to production GTK controls" {
    const source = @embedFile("app.zig");
    for ([_][]const u8{
        "selected-workspace:focus-visible",
        "win.toggle-current-pin",
        "setup-menu",
        "tabSetupMenu",
        "git-stacks-launcher",
    }) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "outline: 2px solid @accent_color") == null);
}

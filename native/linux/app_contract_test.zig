const std = @import("std");

test "production application owns background replay and authoritative launch ordering" {
    const source = @embedFile("app.zig");
    try std.testing.expect(std.mem.indexOf(u8, source, "std.Thread.spawn(.{},replayWorker") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "g_main_context_invoke") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "replay_cancel.store(true") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "thread.join()") != null);
    const resolve = std.mem.indexOf(u8, source, "resolvedLaunchSpec(state,pair)").?;
    const create = std.mem.indexOf(u8, source, "Surface.createWithLaunch").?;
    const publish = std.mem.indexOf(u8, source, "state.terminals[0] = terminal").?;
    try std.testing.expect(resolve < create and create < publish);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_SURFACE_ID") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_WORKSPACE_ID") != null);
    try std.testing.expect(std.mem.indexOf(u8, source, "GIT_STACKS_REPOSITORY_ID") != null);
}

test "production GTK shell registers widgets actions callbacks and non-presenting replay projection" {
    const source = @embedFile("app.zig");
    const required = [_][]const u8{
        "adw_navigation_split_view_new",
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
        "gtk_popover_popup",
        "gtk_accessible_update_property",
        "refreshProjection(dispatch.state)",
    };
    for (required) |needle| try std.testing.expect(std.mem.indexOf(u8, source, needle) != null);
    const replay_refresh = std.mem.indexOf(u8, source, "refreshProjection(dispatch.state)").?;
    const replay_worker = std.mem.indexOfPos(u8, source, replay_refresh, "fn replayWorker").?;
    try std.testing.expect(std.mem.indexOf(u8, source[replay_refresh..replay_worker], "gtk_window_present") == null);
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
        "state.graph.terminals.close(id)",
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

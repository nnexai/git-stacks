const std = @import("std");
const model = @import("model");
const view = @import("workspace_view");
fn id(ch: u8) model.Id {
    return [_]u8{ch} ** 36;
}
fn base() model.State {
    var s: model.State = .{ .connection = .ready, .workspace_count = 2 };
    s.workspaces[0] = .{ .id = id('a'), .repository_count = 1 };
    s.workspaces[0].repository_ids[0] = id('1');
    s.workspaces[1] = .{ .id = id('b'), .repository_count = 2 };
    s.workspaces[1].repository_ids[0] = id('2');
    s.workspaces[1].repository_ids[1] = id('3');
    model.reconcile(&s);
    return s;
}
test "explicit connection pages never coerce to empty" {
    var s = base();
    var v = view.View{ .state = &s };
    const cases = [_]struct { c: model.Connection, p: view.Page }{ .{ .c = .connecting, .p = .loading }, .{ .c = .disconnected_no_snapshot, .p = .disconnected }, .{ .c = .stale, .p = .stale }, .{ .c = .incompatible, .p = .incompatible }, .{ .c = .refresh_required, .p = .refresh_required }, .{ .c = .failed, .p = .failure } };
    for (cases) |x| {
        s.connection = x.c;
        try std.testing.expectEqual(x.p, v.page());
    }
}
test "every connection page exposes the exact safe recovery action" {
    var s = base();
    var v = view.View{ .state = &s };
    const cases = [_]struct { c: model.Connection, p: view.Page, action: view.StatusAction }{
        .{ .c = .connecting, .p = .loading, .action = .none },
        .{ .c = .disconnected_no_snapshot, .p = .disconnected, .action = .retry_connection },
        .{ .c = .stale, .p = .stale, .action = .refresh },
        .{ .c = .incompatible, .p = .incompatible, .action = .details },
        .{ .c = .refresh_required, .p = .refresh_required, .action = .refresh },
        .{ .c = .failed, .p = .failure, .action = .retry_connection },
    };
    for (cases) |x| {
        s.connection = x.c;
        const presentation = v.status();
        try std.testing.expectEqual(x.p, presentation.page);
        try std.testing.expectEqual(x.action, presentation.action);
        try std.testing.expectEqual(x.c == .stale, presentation.retain_workspace);
        try std.testing.expectEqual(x.c == .ready, presentation.mutations_enabled);
    }
    s.connection = .ready;
    s.workspace_count = 0;
    try std.testing.expectEqual(view.StatusAction.create_workspace, v.status().action);
}
test "single repository is shallow and stable selection pins persist" {
    var s = base();
    var v = view.View{ .state = &s };
    try std.testing.expect(!v.repositoryLevelVisible(0));
    try std.testing.expect(v.repositoryLevelVisible(1));
    try v.pin(id('b'));
    try v.pin(id('a'));
    try v.reorderPin(id('a'), 0);
    try std.testing.expectEqualSlices(u8, &id('a'), &s.pins[0]);
    try std.testing.expect(v.select(.{ .workspace_id = id('b'), .repository_id = id('3') }));
    model.reconcile(&s);
    try std.testing.expect(model.PairKey.eql(s.selected_pair.?, .{ .workspace_id = id('b'), .repository_id = id('3') }));
}
test "pair projection retains hidden collection and tab lifecycle" {
    var s = base();
    s.pair_count = 2;
    s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') }, .surface_count = 2 };
    s.pairs[0].surfaces[0] = .{ .id = id('x'), .lifecycle = .live, .generation = 4 };
    s.pairs[0].surfaces[1] = .{ .id = id('y'), .lifecycle = .live, .generation = 7 };
    s.pairs[1] = .{ .key = .{ .workspace_id = id('b'), .repository_id = id('2') }, .surface_count = 1 };
    s.pairs[1].surfaces[0] = .{ .id = id('z'), .lifecycle = .live, .generation = 9 };
    var v = view.View{ .state = &s };
    try std.testing.expect(v.select(s.pairs[0].key));
    try std.testing.expect(v.selectTab(id('x')));
    try std.testing.expect(v.cycleTab(1));
    try std.testing.expectEqualSlices(u8, &id('y'), &s.surface.?.id);
    try v.reorderTab(id('y'), 0);
    try v.renameTab(id('y'), "build");
    try v.closeTab(id('y'));
    try v.publishRelaunch(id('y'), id('r'));
    try std.testing.expectEqualSlices(u8, &id('y'), &s.pairs[0].surfaces[0].predecessor_surface_id.?);
    try std.testing.expectEqual(@as(u64, 8), s.pairs[0].surfaces[0].generation);
    try std.testing.expectEqual(@as(u64, 9), s.pairs[1].surfaces[0].generation);
    try std.testing.expectError(error.InvalidRelaunch, v.publishRelaunch(id('x'), id('q')));
}
test "recycled row clears identity css handlers and drag state" {
    var row: view.RowBinding = .{ .workspace_id = id('a'), .repository_id = id('1'), .css_pinned = true, .drag_id = id('a'), .label_len = 4 };
    row.unbind();
    try std.testing.expect(row.workspace_id == null and row.repository_id == null and row.drag_id == null and !row.css_pinned and row.label_len == 0);
}
test "repository grouping emits one shared repository group" {
    var s = base();
    for (0..2) |i| {
        s.workspaces[i].repositories[0].name_len = 4;
        @memcpy(s.workspaces[i].repositories[0].name[0..4], "repo");
    }
    try std.testing.expect(view.firstRepositoryNameOccurrence(&s, 0, 0));
    try std.testing.expect(!view.firstRepositoryNameOccurrence(&s, 1, 0));
}
test "workspace priority sorts descending inside a section" {
    var s = base();
    @memcpy(s.workspaces[0].name[0..5], "Alpha"); s.workspaces[0].name_len = 5;
    @memcpy(s.workspaces[1].name[0..4], "Beta"); s.workspaces[1].name_len = 4;
    s.workspaces[0].priority = 1;
    s.workspaces[1].priority = 20;
    s.pair_count = 2;
    s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') } };
    s.pairs[1] = .{ .key = .{ .workspace_id = id('b'), .repository_id = id('2') } };

    const projection = view.project(&s, .wide);
    try std.testing.expectEqualSlices(u8, &id('b'), &projection.rows[0].key.workspace_id);
    try std.testing.expectEqualSlices(u8, &id('a'), &projection.rows[1].key.workspace_id);
}
test "signals decorate stable groups instead of moving rows into Active" {
    var s = base();
    @memcpy(s.workspaces[0].name[0..5], "Alpha"); s.workspaces[0].name_len = 5;
    @memcpy(s.workspaces[0].repositories[0].name[0..4], "repo"); s.workspaces[0].repositories[0].name_len = 4;
    s.workspaces[0].repositories[0].presentation = .{ .branch_len = 4, .default_branch_len = 4, .additions = 3, .removals = 1 };
    @memcpy(s.workspaces[0].repositories[0].presentation.?.branch[0..4], "main");
    @memcpy(s.workspaces[0].repositories[0].presentation.?.default_branch[0..4], "main");
    s.pair_count = 1; s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') }, .surface_count = 1 }; s.pairs[0].surfaces[0] = .{ .id = id('x'), .lifecycle = .live };
    s.pin_count = 1; s.pins[0] = id('a'); s.selected_pair = s.pairs[0].key;
    s.signal_count = 3;
    s.signals[0] = .{ .id = id('s'), .workspace_id = id('a'), .repository_id = id('1'), .status = .waiting, .resolved = false, .read = false };
    s.signals[1] = .{ .id = id('t'), .workspace_id = id('a'), .repository_id = id('1'), .status = .working, .read = true };
    s.signals[2] = .{ .id = id('u'), .kind = .notification, .workspace_id = id('a'), .repository_id = id('1'), .status = .waiting, .read = false };
    const p = view.project(&s, .wide);
    try std.testing.expectEqual(@as(u8, 1), p.row_count);
    try std.testing.expect(p.rows[0].section == .pinned and p.rows[0].selected and p.rows[0].awaiting and p.rows[0].activity);
    const description = p.rows[0].accessible[0..p.rows[0].accessible_len];
    for ([_][]const u8{ "branch main", "default branch", "Git +3 -1", "pinned", "agent sessions", "awaiting input", "activity", "unread" }) |needle| try std.testing.expect(std.mem.indexOf(u8, description, needle) != null);
}
test "label and repository modes project genuinely different stable hierarchies" {
    var s = base();
    @memcpy(s.workspaces[0].name[0..5], "Alpha"); s.workspaces[0].name_len = 5;
    @memcpy(s.workspaces[1].name[0..4], "Beta"); s.workspaces[1].name_len = 4;
    @memcpy(s.workspaces[0].labels[0][0..6], "Client"); s.workspaces[0].label_lens[0] = 6; s.workspaces[0].label_count = 1;
    @memcpy(s.workspaces[1].labels[0][0..6], "Server"); s.workspaces[1].label_lens[0] = 6; s.workspaces[1].label_count = 1;
    @memcpy(s.workspaces[0].repositories[0].name[0..4], "repo"); s.workspaces[0].repositories[0].name_len = 4;
    @memcpy(s.workspaces[1].repositories[0].name[0..4], "repo"); s.workspaces[1].repositories[0].name_len = 4;
    @memcpy(s.workspaces[1].repositories[1].name[0..5], "tools"); s.workspaces[1].repositories[1].name_len = 5;
    s.pair_count = 3;
    s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') } };
    s.pairs[1] = .{ .key = .{ .workspace_id = id('b'), .repository_id = id('2') } };
    s.pairs[2] = .{ .key = .{ .workspace_id = id('b'), .repository_id = id('3') } };
    s.pin_count = 1; s.pins[0] = id('a');

    s.organization_mode = .label;
    const labels = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(@as(u8, 2), labels.group_count);
    try std.testing.expectEqual(view.SidebarGroupKind.pinned, labels.groups[0].kind);
    try std.testing.expectEqualStrings("Server", labels.groups[1].title[0..labels.groups[1].title_len]);
    try std.testing.expectEqual(@as(u8, 2), labels.groups[1].row_count);

    s.organization_mode = .repository;
    const repositories = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(@as(u8, 3), repositories.group_count);
    try std.testing.expectEqual(view.SidebarGroupKind.repository, repositories.groups[1].kind);
    try std.testing.expectEqualStrings("repo", repositories.groups[1].title[0..repositories.groups[1].title_len]);
    try std.testing.expectEqualStrings("tools", repositories.groups[2].title[0..repositories.groups[2].title_len]);
}
test "unpinned signals remain inside the selected organization group" {
    var s = base();
    @memcpy(s.workspaces[0].labels[0][0..6], "Client"); s.workspaces[0].label_lens[0] = 6; s.workspaces[0].label_count = 1;
    s.pair_count = 1; s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') } };
    s.signal_count = 1; s.signals[0] = .{ .id = id('s'), .workspace_id = id('a'), .repository_id = id('1'), .status = .waiting };
    const sidebar = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(@as(u8, 1), sidebar.group_count);
    try std.testing.expectEqual(view.SidebarGroupKind.label, sidebar.groups[0].kind);
    try std.testing.expect(sidebar.workspace.rows[0].awaiting);
    try std.testing.expectEqual(view.WorkspaceSection.ordinary, sidebar.workspace.rows[0].section);
}
test "Active is temporary for working agents and configured commands while outcomes persist" {
    var s = base();
    @memcpy(s.workspaces[0].labels[0][0..6], "Client"); s.workspaces[0].label_lens[0] = 6; s.workspaces[0].label_count = 1;
    s.pair_count = 1; s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') }, .surface_count = 1 };
    s.pairs[0].surfaces[0] = .{ .id = id('x'), .lifecycle = .live, .kind = .shell };
    s.signal_count = 1; s.signals[0] = .{ .id = id('s'), .workspace_id = id('a'), .repository_id = id('1'), .status = .working };
    var sidebar = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(view.SidebarGroupKind.active, sidebar.groups[0].kind);
    try std.testing.expect(sidebar.workspace.rows[0].activity and !sidebar.workspace.rows[0].running);

    s.signals[0].status = .waiting;
    sidebar = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(view.SidebarGroupKind.label, sidebar.groups[0].kind);
    try std.testing.expect(sidebar.workspace.rows[0].awaiting and !sidebar.workspace.rows[0].activity);

    s.signals[0].status = .completed;
    sidebar = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(view.SidebarGroupKind.label, sidebar.groups[0].kind);
    try std.testing.expect(sidebar.workspace.rows[0].completed and !sidebar.workspace.rows[0].activity);

    s.signals[0].status = .idle;
    s.pairs[0].surfaces[0].kind = .configured_command;
    sidebar = view.projectSidebar(&s, .wide);
    try std.testing.expectEqual(view.SidebarGroupKind.active, sidebar.groups[0].kind);
    try std.testing.expect(sidebar.workspace.rows[0].running);
}
test "provider sessions preserve duplicates sort awaiting first and overflow" {
    var s = base(); s.pair_count = 1; s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') } }; s.signal_count = 6;
    const providers = [_]model.SignalSource{ .codex, .copilot, .codex, .claude, .automation };
    for (providers, 0..) |provider, i| { var sid = id('m'); sid[0] +%= @intCast(i); s.signals[i] = .{ .id = sid, .workspace_id = id('a'), .repository_id = id('1'), .provider = provider, .status = if (i == 2) .waiting else .working }; s.signals[i].signal_id[0] = @intCast('a' + i); s.signals[i].signal_id_len = 1; }
    s.signals[5] = .{ .id = id('z'), .kind = .notification, .workspace_id = id('a'), .repository_id = id('1'), .status = .waiting, .read = false };
    const row = view.project(&s, .wide).rows[0];
    try std.testing.expectEqual(@as(u8, 5), row.agent_count);
    try std.testing.expectEqual(@as(u8, 3), row.provider_badge_count);
    try std.testing.expectEqual(@as(u8, 2), row.agent_overflow);
    try std.testing.expect(row.provider_badges[0].awaiting and row.provider_badges[0].provider == .codex);
    try std.testing.expect(row.activity and row.unread);
    s.signals[0].status = .completed; s.signals[1].status = .idle;
    const history = view.project(&s, .wide).rows[0];
    try std.testing.expectEqual(@as(u8, 3), history.agent_count);
}
test "compression tiers keep semantic markers while collapsing detail" {
    const wide = view.compression(.wide); const medium = view.compression(.medium); const narrow = view.compression(.narrow); const scaled = view.compression(.text_200);
    try std.testing.expect(wide.secondary and wide.git and wide.pr_expanded and wide.agent_limit == 3);
    try std.testing.expect(!medium.secondary and medium.git and medium.pr_expanded);
    try std.testing.expect(narrow.secondary and narrow.git and !narrow.pr_expanded and narrow.agent_limit == 1);
    try std.testing.expect(scaled.secondary and !scaled.git and !scaled.pr_expanded and scaled.agent_limit == 1);
}
test "measured allocation and 200 percent text choose deterministic tiers" {
    try std.testing.expectEqual(view.WorkspaceCompressionTier.wide, view.compressionForAllocation(800, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.medium, view.compressionForAllocation(500, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.narrow, view.compressionForAllocation(320, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.text_200, view.compressionForAllocation(800, 200));
    for ([_]view.WorkspaceCompressionTier{ .narrow, .text_200 }) |tier| {
        const visible = view.compression(tier);
        try std.testing.expect(visible.secondary and visible.agent_limit == 1);
    }
}
test "selection and focus semantics remain distinct across active and inactive windows" {
    const active = view.interaction(true, true, true); const inactive = view.interaction(true, false, true); const ordinary = view.interaction(false, true, false);
    try std.testing.expectEqualStrings("selected-workspace", active.selected_class);
    try std.testing.expectEqualStrings("selected-workspace-inactive", inactive.selected_class);
    try std.testing.expectEqualStrings("keyboard-focus", active.focus_class);
    try std.testing.expect(ordinary.selected_class.len == 0 and ordinary.focus_class.len == 0 and active.preserve_unread_error);
}

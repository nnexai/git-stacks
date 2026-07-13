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
test "active relevance implements all ten normative priorities" {
    const cases = [_]struct { unread: bool, awaiting: bool, agent: bool, running: bool }{
        .{ .unread = true, .awaiting = true, .agent = false, .running = true },
        .{ .unread = true, .awaiting = true, .agent = false, .running = false },
        .{ .unread = true, .awaiting = false, .agent = true, .running = true },
        .{ .unread = true, .awaiting = false, .agent = true, .running = false },
        .{ .unread = true, .awaiting = false, .agent = false, .running = true },
        .{ .unread = false, .awaiting = true, .agent = false, .running = true },
        .{ .unread = false, .awaiting = true, .agent = false, .running = false },
        .{ .unread = false, .awaiting = false, .agent = true, .running = true },
        .{ .unread = false, .awaiting = false, .agent = true, .running = false },
        .{ .unread = false, .awaiting = false, .agent = false, .running = true },
    };
    for (cases, 1..) |case, priority| try std.testing.expectEqual(@as(?u8, @intCast(priority)), view.activePriority(case.unread, case.awaiting, case.agent, case.running));
    try std.testing.expect(view.activePriority(false, false, false, false) == null);
}
test "projection deduplicates pinned over active and preserves PairKey selection" {
    var s = base();
    @memcpy(s.workspaces[0].name[0..5], "Alpha"); s.workspaces[0].name_len = 5;
    @memcpy(s.workspaces[0].repositories[0].name[0..4], "repo"); s.workspaces[0].repositories[0].name_len = 4;
    s.workspaces[0].repositories[0].presentation = .{ .branch_len = 4, .default_branch_len = 4, .additions = 3, .removals = 1 };
    @memcpy(s.workspaces[0].repositories[0].presentation.?.branch[0..4], "main");
    @memcpy(s.workspaces[0].repositories[0].presentation.?.default_branch[0..4], "main");
    s.pair_count = 1; s.pairs[0] = .{ .key = .{ .workspace_id = id('a'), .repository_id = id('1') }, .surface_count = 1 }; s.pairs[0].surfaces[0] = .{ .id = id('x'), .lifecycle = .live };
    s.pin_count = 1; s.pins[0] = id('a'); s.selected_pair = s.pairs[0].key;
    s.signal_count = 2;
    s.signals[0] = .{ .id = id('s'), .workspace_id = id('a'), .repository_id = id('1'), .status = .waiting, .resolved = false, .read = false };
    s.signals[1] = .{ .id = id('t'), .workspace_id = id('a'), .repository_id = id('1'), .status = .working, .read = true };
    const p = view.project(&s, .wide);
    try std.testing.expectEqual(@as(u8, 1), p.row_count);
    try std.testing.expect(p.rows[0].section == .pinned and p.rows[0].selected and p.rows[0].awaiting and p.rows[0].activity);
    const description = p.rows[0].accessible[0..p.rows[0].accessible_len];
    for ([_][]const u8{ "branch main", "default branch", "Git +3 -1", "pinned", "agent sessions", "awaiting input", "running", "activity", "unread" }) |needle| try std.testing.expect(std.mem.indexOf(u8, description, needle) != null);
}
test "compression tiers keep semantic markers while collapsing detail" {
    const wide = view.compression(.wide); const medium = view.compression(.medium); const narrow = view.compression(.narrow); const scaled = view.compression(.text_200);
    try std.testing.expect(wide.secondary and wide.git and wide.pr_expanded and wide.agent_limit == 3);
    try std.testing.expect(!medium.secondary and medium.git and medium.pr_expanded);
    for ([_]view.CompressionVisibility{ narrow, scaled }) |tier| try std.testing.expect(!tier.secondary and !tier.git and !tier.pr_expanded and tier.agent_limit == 1);
}
test "measured allocation and 200 percent text choose deterministic tiers" {
    try std.testing.expectEqual(view.WorkspaceCompressionTier.wide, view.compressionForAllocation(800, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.medium, view.compressionForAllocation(500, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.narrow, view.compressionForAllocation(320, 100));
    try std.testing.expectEqual(view.WorkspaceCompressionTier.text_200, view.compressionForAllocation(800, 200));
    for ([_]view.WorkspaceCompressionTier{ .narrow, .text_200 }) |tier| {
        const visible = view.compression(tier);
        try std.testing.expect(!visible.secondary and !visible.git and visible.agent_limit == 1);
    }
}
test "selection and focus semantics remain distinct across active and inactive windows" {
    const active = view.interaction(true, true, true); const inactive = view.interaction(true, false, true); const ordinary = view.interaction(false, true, false);
    try std.testing.expectEqualStrings("selected-workspace", active.selected_class);
    try std.testing.expectEqualStrings("selected-workspace-inactive", inactive.selected_class);
    try std.testing.expectEqualStrings("keyboard-focus", active.focus_class);
    try std.testing.expect(ordinary.selected_class.len == 0 and ordinary.focus_class.len == 0 and active.preserve_unread_error);
}

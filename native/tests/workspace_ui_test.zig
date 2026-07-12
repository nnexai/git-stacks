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

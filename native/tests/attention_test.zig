const std = @import("std");
const reducer = @import("reducer");
const view = @import("attention_view");
const model = reducer.model;
fn id(comptime v: []const u8) model.Id {
    return v[0..36].*;
}
fn base() model.State {
    var s: model.State = .{};
    const ws = id("118f47f4-5ab1-7c2d-8e90-123456789abc");
    const repo = id("218f47f4-5ab1-7c2d-8e90-123456789abc");
    s.workspace_count = 1;
    s.workspaces[0] = .{ .id = ws, .repository_ids = undefined, .repository_count = 1 };
    s.workspaces[0].repository_ids[0] = repo;
    s.pair_count = 1;
    s.pairs[0] = .{ .key = .{ .workspace_id = ws, .repository_id = repo }, .surfaces = undefined, .surface_count = 1 };
    s.pairs[0].surfaces[0] = .{ .id = id("318f47f4-5ab1-7c2d-8e90-123456789abc"), .lifecycle = .live };
    return s;
}
test "receipt derives severity without focus and duplicates cannot drift" {
    var s = base();
    const item: model.Signal = .{ .id = id("418f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = s.workspaces[0].id, .repository_id = s.pairs[0].key.repository_id, .surface_id = s.pairs[0].surfaces[0].id, .status = .failed };
    const first = reducer.reduce(s, .{ .signal_received = item });
    try std.testing.expect(first.effect == .none);
    s = first.state;
    try std.testing.expectEqual(@as(u32, 1), model.aggregate(&s, item.workspace_id, null, null).unread);
    s = reducer.reduce(s, .{ .signal_received = item }).state;
    try std.testing.expectEqual(@as(u32, 1), model.aggregate(&s, item.workspace_id, null, null).unread);
}
test "working idle and completed remain non-unread history" {
    var s = base();
    const ws = s.workspaces[0].id;
    const repo = s.pairs[0].key.repository_id;
    for ([_]model.SignalState{ .working, .idle, .completed }, 0..) |status, i| {
        var aid = id("518f47f4-5ab1-7c2d-8e90-123456789abc");
        aid[0] += @intCast(i);
        s = reducer.reduce(s, .{ .signal_received = .{ .id = aid, .workspace_id = ws, .repository_id = repo, .status = status } }).state;
    }
    const a = model.aggregate(&s, ws, null, null);
    try std.testing.expectEqual(@as(u32, 0), a.unread);
    try std.testing.expectEqual(model.Severity.none, a.severity);
}
test "one signal identity advances lifecycle and completed becomes non-unread" {
    var s = base();
    const aid = id("818f47f4-5ab1-7c2d-8e90-123456789abc");
    const ws = s.workspaces[0].id;
    s = reducer.reduce(s, .{ .signal_received = .{ .id = aid, .workspace_id = ws, .status = .working } }).state;
    try std.testing.expectEqual(@as(u8, 1), s.signal_count);
    try std.testing.expectEqual(@as(u32, 0), model.aggregate(&s, ws, null, null).unread);
    s = reducer.reduce(s, .{ .signal_received = .{ .id = aid, .workspace_id = ws, .status = .completed } }).state;
    try std.testing.expectEqual(@as(u8, 1), s.signal_count);
    try std.testing.expectEqual(model.SignalState.completed, s.signals[0].status);
    try std.testing.expectEqual(@as(u32, 0), model.aggregate(&s, ws, null, null).unread);
}
test "explicit selection focuses exact live surface and visible focus clears current tab" {
    var s = base();
    const aid = id("418f47f4-5ab1-7c2d-8e90-123456789abc");
    s = reducer.reduce(s, .{ .signal_received = .{ .id = aid, .workspace_id = s.workspaces[0].id, .repository_id = s.pairs[0].key.repository_id, .surface_id = s.pairs[0].surfaces[0].id, .status = .waiting } }).state;
    const selected = reducer.reduce(s, .{ .select_attention = .{ .attention_id = aid } });
    try std.testing.expect(selected.effect == .platform_focus);
    try std.testing.expectEqual(model.FallbackReason.exact_surface, selected.effect.platform_focus.reason);
    try std.testing.expect(selected.state.signals[0].read);
}
test "navigation and asynchronous receipt have zero focus effects; fallback is diagnostic" {
    var s = base();
    const ws = s.workspaces[0].id;
    const repo = s.pairs[0].key.repository_id;
    const aid = id("618f47f4-5ab1-7c2d-8e90-123456789abc");
    const nav = reducer.reduce(s, .{ .navigate_pair = .{ .workspace_id = ws, .repository_id = repo } });
    try std.testing.expect(nav.effect == .none);
    s = reducer.reduce(nav.state, .{ .signal_received = .{ .id = aid, .workspace_id = ws, .repository_id = repo, .surface_id = id("718f47f4-5ab1-7c2d-8e90-123456789abc"), .status = .failed } }).state;
    const selected = reducer.reduce(s, .{ .select_attention = .{ .attention_id = aid } });
    try std.testing.expectEqual(model.FallbackReason.repository, selected.effect.platform_focus.reason);
}

test "provider presentation survives canonical encoding and duplicate service ids update" {
    var s = base();
    var first: model.Signal = .{ .id = id("918f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = s.workspaces[0].id, .status = .working, .provider = .codex };
    const service = "att_codex_1234567890";
    @memcpy(first.signal_id[0..service.len], service);
    first.signal_id_len = service.len;
    const title = "Codex needs attention";
    @memcpy(first.title[0..title.len], title);
    first.title_len = title.len;
    const detail = "Unicode detail: ✓";
    @memcpy(first.detail[0..detail.len], detail);
    first.detail_len = detail.len;
    s = reducer.reduce(s, .{ .signal_received = first }).state;
    var update = first;
    update.id = id("a18f47f4-5ab1-7c2d-8e90-123456789abc");
    update.status = .waiting;
    s = reducer.reduce(s, .{ .signal_received = update }).state;
    try std.testing.expectEqual(@as(u8, 1), s.signal_count);
    try std.testing.expectEqual(model.SignalState.waiting, s.signals[0].status);
    const bytes = try model.canonicalAlloc(std.testing.allocator, s);
    defer std.testing.allocator.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"provider\":\"codex\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "Unicode detail") != null);
}

test "attention overflow evicts safe items and otherwise reports loss" {
    var s = base();
    s.signal_count = model.NativeModelLimits.signal_items;
    for (s.signals[0..s.signal_count], 0..) |*item, i| {
        var aid = id("b18f47f4-5ab1-7c2d-8e90-123456789abc");
        aid[0] +%= @intCast(i);
        item.* = .{ .id = aid, .workspace_id = s.workspaces[0].id, .status = .waiting };
    }
    // Keep this identity outside the generated b.. range so this exercises
    // capacity handling instead of the reducer's intentional update path.
    const incoming: model.Signal = .{ .id = id("018f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = s.workspaces[0].id, .status = .failed };
    s = reducer.reduce(s, .{ .signal_received = incoming }).state;
    try std.testing.expectEqual(@as(u32, 1), s.signal_overflow_count);
    s.signals[0].read = true;
    s = reducer.reduce(s, .{ .signal_received = incoming }).state;
    try std.testing.expectEqual(incoming.id, s.signals[0].id);
}

test "exact visibility does not clear broader attention" {
    var s = base();
    const ws = s.workspaces[0].id;
    const surface = s.pairs[0].surfaces[0].id;
    s = reducer.reduce(s, .{ .signal_received = .{ .id = id("d18f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = ws, .status = .waiting } }).state;
    s = reducer.reduce(s, .{ .signal_received = .{ .id = id("e18f47f4-5ab1-7c2d-8e90-123456789abc"), .workspace_id = ws, .surface_id = surface, .status = .waiting } }).state;
    s = reducer.reduce(s, .{ .exact_tab_visible = .{ .surface_id = surface } }).state;
    try std.testing.expect(!s.signals[0].read);
    try std.testing.expect(s.signals[1].read);
}

test "provider-aware row projects Codex detail location unread and fallback" {
    const ws = id("a18f47f4-5ab1-7c2d-8e90-123456789abc");
    const repo = id("b18f47f4-5ab1-7c2d-8e90-123456789abc");
    const missing = id("c18f47f4-5ab1-7c2d-8e90-123456789abc");
    var s: model.State = .{ .workspace_count = 1 };
    s.workspaces[0] = .{ .id = ws, .repository_count = 1 };
    s.workspaces[0].repository_ids[0] = repo;
    s.workspaces[0].repositories[0].id = repo;
    @memcpy(s.workspaces[0].name[0..4], "Demo"); s.workspaces[0].name_len = 4;
    @memcpy(s.workspaces[0].repositories[0].name[0..3], "api"); s.workspaces[0].repositories[0].name_len = 3;
    var item: model.Signal = .{ .id = id("d18f47f4-5ab1-7c2d-8e90-123456789abc"), .provider = .codex, .workspace_id = ws, .repository_id = repo, .surface_id = missing, .status = .waiting };
    @memcpy(item.title[0..15], "Approval needed"); item.title_len = 15;
    @memcpy(item.detail[0..13], "Run the tests"); item.detail_len = 13;
    const row = view.project(&s, item);
    try std.testing.expectEqualStrings("Codex", row.provider);
    try std.testing.expectEqualStrings("Approval needed", row.title[0..row.title_len]);
    try std.testing.expectEqualStrings("Run the tests", row.detail[0..row.detail_len]);
    try std.testing.expectEqualStrings("Demo / api", row.location[0..row.location_len]);
    try std.testing.expect(row.unread);
    try std.testing.expect(std.mem.indexOf(u8, row.fallback, "repository") != null);
}

test "UTF-8 prefix truncation never splits a multibyte codepoint" {
    const value = "1234567✓suffix";
    const prefix = model.utf8Prefix(value, 9) orelse return error.InvalidUtf8;
    try std.testing.expectEqualStrings("1234567", prefix);
    try std.testing.expect(std.unicode.utf8ValidateSlice(prefix));
    try std.testing.expect(model.utf8Prefix("\xff", 8) == null);
}

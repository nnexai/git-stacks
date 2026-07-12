const std = @import("std");
const model = @import("model");
const app = @import("application");
const launcher = @import("command_launcher");
const attention = @import("attention_view");
const production_contract = @import("production_app_contract");
fn id(ch: u8) model.Id {
    return [_]u8{ch} ** 36;
}
fn cmd(i: u8, name: []const u8, repo: ?model.Id) model.Command {
    var c: model.Command = .{ .workspace_id = id('w'), .repository_id = repo };
    c.id[0] = i;
    c.id_len = 1;
    c.name_len = @intCast(name.len);
    @memcpy(c.name[0..name.len], name);
    return c;
}
test "all activation sources converge on scoped action names and readiness" {
    _ = production_contract;
    try production_contract.verifyCallbacks();
    try std.testing.expect(app.actions.len >= 14);
    var stale: model.State = .{ .connection = .stale };
    for (app.actions) |a| if (a.requires_ready) try std.testing.expect(!app.enabled(&stale, a));
    stale.connection = .ready;
    for (app.actions) |a| try std.testing.expect(app.enabled(&stale, a));
    try std.testing.expectEqualStrings("win.new-workspace", app.actions[0].name);
    try std.testing.expectEqualStrings("<Primary><Shift>n", app.actions[0].accelerator.?);
}
test "adaptive thresholds spacing and recovery actions are centralized" {
    const breakpoint: app.Breakpoint = .{};
    try std.testing.expect(breakpoint.collapsed(719));
    try std.testing.expect(!breakpoint.collapsed(720));
    try std.testing.expect(breakpoint.wide(1080));
    try std.testing.expectEqual(@as(i32, 4), app.Spacing.inline_control);
    try std.testing.expectEqual(@as(i32, 6), app.Spacing.row);
    try std.testing.expectEqual(@as(i32, 12), app.Spacing.section);
    try std.testing.expectEqual(@as(i32, 18), app.Spacing.content);
    const required = [_][]const u8{"win.retry-service", "win.refresh-service", "win.connection-details", "win.toggle-current-pin", "win.move-current-pin-up", "win.move-current-pin-down"};
    for (required) |name| {
        var found = false;
        for (app.actions) |spec| {
            if (std.mem.eql(u8, spec.name, name)) found = true;
        }
        try std.testing.expect(found);
    }
}
test "configured command launcher filters scope orders recents and preserves structured failure" {
    var s: model.State = .{ .connection = .ready, .command_count = 4 };
    s.commands[0] = cmd('a', "Test", id('r'));
    s.commands[1] = cmd('b', "Build", null);
    s.commands[2] = cmd('c', "Test", null);
    s.commands[3] = cmd('d', "Foreign", id('x'));
    var l = launcher.Launcher{ .state = &s, .pair = .{ .workspace_id = id('w'), .repository_id = id('r') } };
    l.record("c");
    var out: [8]launcher.Item = undefined;
    const n = l.collect("", &out);
    try std.testing.expectEqual(@as(usize, 3), n);
    try std.testing.expectEqual(@as(usize, 2), out[0].command_index);
    try std.testing.expect(out[0].duplicate_name and out[0].scope == .workspace);
    try std.testing.expectEqual(@as(usize,0),l.selectAfterRefresh(out[0..n]));
    try std.testing.expectEqual(@as(usize,1),l.moveSelection(out[0..n],0,1));
    try std.testing.expectEqual(@as(usize,1),l.selectAfterRefresh(out[0..n]));
    l.fail("resolution: repository stale");
    try std.testing.expect(l.open);
    try std.testing.expectEqualStrings("resolution: repository stale", l.error_message[0..l.error_len]);
}
test "launcher distinguishes empty catalog from no matches and wraps selection" {
    var s:model.State=.{.connection=.ready,.command_count=1}; s.commands[0]=cmd('a',"Build",id('r'));
    var l=launcher.Launcher{.state=&s,.pair=.{.workspace_id=id('w'),.repository_id=id('r')}};
    var out:[4]launcher.Item=undefined;
    try std.testing.expectEqual(launcher.EmptyState.no_matches,l.emptyState("zzz",l.collect("zzz",&out)));
    try std.testing.expectEqual(@as(usize,0),l.selectAfterRefresh(out[0..l.collect("",&out)]));
    try std.testing.expectEqual(@as(usize,0),l.moveSelection(out[0..1],0,-1));
    l.pair.repository_id=id('x');
    try std.testing.expectEqual(launcher.EmptyState.no_configured_commands,l.emptyState("",l.collect("",&out)));
}
test "production launcher includes every configured command" {
    var s: model.State = .{ .connection = .ready, .command_count = 2 };
    s.commands[0] = cmd('a', "tui-output-smoke", id('r'));
    s.commands[1] = cmd('b', "Build", id('r'));
    var l = launcher.Launcher{ .state = &s, .pair = .{ .workspace_id = id('w'), .repository_id = id('r') } };
    var out: [4]launcher.Item = undefined;
    const count = l.collect("", &out);
    try std.testing.expectEqual(@as(usize, 2), count);
    try std.testing.expectEqualStrings("Build", s.commands[out[0].command_index].name[0..s.commands[out[0].command_index].name_len]);
    try std.testing.expectEqualStrings("tui-output-smoke", s.commands[out[1].command_index].name[0..s.commands[out[1].command_index].name_len]);
}
test "incoming attention has no focus effect and explicit activation explains fallback" {
    var s: model.State = .{ .connection = .ready, .workspace_count = 1 };
    s.workspaces[0] = .{ .id = id('w'), .repository_count = 1 };
    s.workspaces[0].repository_ids[0] = id('r');
    const a: model.Attention = .{ .id = id('a'), .workspace_id = id('w'), .repository_id = id('r'), .surface_id = id('q'), .status = .failed };
    const received = attention.asynchronous(s, a);
    try std.testing.expect(received.effect == .none);
    const activated = attention.activate(received.state, id('a'));
    try std.testing.expect(activated.effect == .platform_focus);
    try std.testing.expectEqual(model.FallbackReason.repository, activated.effect.platform_focus.reason);
}
test "VS Code invocation uses authoritative git-stacks workspace name" {
    var s:model.State=.{.connection=.ready,.workspace_count=1};
    s.workspaces[0]=.{.id=id('w'),.repository_count=1};
    s.workspaces[0].repository_ids[0]=id('r');s.workspaces[0].repositories[0].id=id('r');
    @memcpy(s.workspaces[0].name[0..7],"feature");s.workspaces[0].name_len=7;
    @memcpy(s.workspaces[0].repositories[0].name[0..3],"api");s.workspaces[0].repositories[0].name_len=3;
    const invocation=try app.vscodeInvocation(&s,.{.workspace_id=id('w'),.repository_id=id('r')},"git-stacks");
    try std.testing.expectEqual(@as(usize,5),invocation.len);
    const expected:[5][]const u8=.{"git-stacks","integration","vscode","open","feature"};for(expected,0..)|value,i|try std.testing.expectEqualStrings(value,invocation.argv[i]);
}

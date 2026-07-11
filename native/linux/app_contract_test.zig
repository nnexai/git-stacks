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

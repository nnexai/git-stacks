const std = @import("std");
const creation = @import("workspace_creation");
fn deterministic(bytes: []u8) !void { @memset(bytes, 0xab); }

test "template submission escapes JSON and freezes idempotency" {
    var controller: creation.Controller = .{ .connected = true, .catalog_loaded = true };
    try controller.setName("a\"b\\c");
    try controller.selectTemplate("full", "main");
    var submission = try controller.beginSubmission(std.testing.allocator, deterministic);
    defer submission.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings("idem_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", submission.key());
    try std.testing.expect(std.mem.indexOf(u8, submission.body, "a\\\"b\\\\c") != null);
    try std.testing.expect(controller.state == .submitting);
}

test "manual branch survives source changes and repository toggles stay unique" {
    var controller: creation.Controller = .{ .connected = true, .catalog_loaded = true };
    try controller.setName("demo"); try controller.setBranch("topic");
    try controller.selectTemplate("full", "ignored");
    try std.testing.expectEqualStrings("topic", controller.branch[0..controller.branch_len]);
    controller.source_kind = .repositories;
    try controller.toggleRepository("app"); try controller.toggleRepository("api"); try controller.toggleRepository("app");
    try std.testing.expectEqual(@as(u8, 1), controller.repository_count);
    try std.testing.expect(controller.ready());
}

test "operation progress is ordered and terminal failure retains form" {
    var controller: creation.Controller = .{};
    try controller.setName("demo"); try controller.setBranch("main");
    try controller.bindOperation("op_1234567890123456");
    try controller.progress(2, 4); try controller.finish(.failed);
    try std.testing.expectEqual(@as(u32, 2), controller.completed);
    try std.testing.expectEqualStrings("demo", controller.name[0..controller.name_len]);
}

test "operation id is copied out of temporary JSON storage" {
    var owned: [64]u8 = undefined;
    const id = creation.copyJsonStringField("{\"data\":{\"operation_id\":\"op_1234567890123456\"}}", "operation_id", &owned) orelse return error.MissingOperation;
    // Churn the page allocator after parsing has deinitialized its tree. The
    // returned bytes must remain caller-owned and valid for polling.
    const churn = try std.heap.page_allocator.alloc(u8, 4096);
    defer std.heap.page_allocator.free(churn);
    @memset(churn, 0xa5);
    try std.testing.expectEqualStrings("op_1234567890123456", id);
}

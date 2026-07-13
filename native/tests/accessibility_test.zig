const std = @import("std");
const surface = @import("ghostty_surface");
const attention = @import("attention_view");
const model = @import("model");
const c = @cImport({ @cInclude("gtk/gtk.h"); });
const workspace = @import("workspace_view");

test "production GtkGLArea exposes only its truthful accessibility contract" {
    c.gtk_init();
    const area = c.gtk_gl_area_new() orelse return error.GtkGlAreaFailed;
    defer c.g_object_unref(c.g_object_ref_sink(area));
    surface.configureAccessibility(@ptrCast(area));
    const observed = surface.inspectAccessibility(@ptrCast(area));
    try std.testing.expectEqual(@as(c.GtkAccessibleRole, c.GTK_ACCESSIBLE_ROLE_GENERIC), observed.role);
    try std.testing.expect(observed.focusable);
    try std.testing.expectEqualStrings("git-stacks Ghostty terminal", surface.AccessibilityContract.name);
    try std.testing.expect(!surface.AccessibilityContract.cell_text);
    try std.testing.expect(!surface.AccessibilityContract.caret);
    try std.testing.expect(!surface.AccessibilityContract.selection);
    try std.testing.expect(!surface.AccessibilityContract.actions);
}

test "hierarchical attention has redundant icon text count and accessible description" {
    const id = [_]u8{'a'} ** 36;
    var state:model.State=.{.signal_count=1};
    state.signals[0]=.{.id=id,.workspace_id=id,.status=.waiting};
    const p=attention.present(&state,id,null,null);
    try std.testing.expectEqual(@as(u32,1),p.unread);
    try std.testing.expect(p.icon.len>0 and p.label_len>0);
    try std.testing.expect(std.mem.indexOf(u8,p.label[0..p.label_len],"unread")!=null);
}

test "attention row redundant text contains provider title and location" {
    const id = [_]u8{'a'} ** 36;
    var state:model.State=.{.workspace_count=1};
    state.workspaces[0]=.{.id=id};
    @memcpy(state.workspaces[0].name[0..4],"Demo"); state.workspaces[0].name_len=4;
    var item:model.Signal=.{.id=id,.provider=.codex,.workspace_id=id,.status=.waiting};
    @memcpy(item.title[0..8],"Approval"); item.title_len=8;
    const row=attention.project(&state,item);
    try std.testing.expectEqualStrings("Codex",row.provider);
    try std.testing.expectEqualStrings("Approval",row.title[0..row.title_len]);
    try std.testing.expectEqualStrings("Demo",row.location[0..row.location_len]);
}

test "workspace compression never removes awaiting unread or accessible meaning" {
    var state: model.State = .{ .connection = .ready, .workspace_count = 1, .pair_count = 1, .signal_count = 1 };
    const wid = [_]u8{'w'} ** 36; const rid = [_]u8{'r'} ** 36;
    state.workspaces[0] = .{ .id = wid, .repository_count = 1 }; state.workspaces[0].repository_ids[0] = rid;
    @memcpy(state.workspaces[0].name[0..4], "Demo"); state.workspaces[0].name_len = 4;
    @memcpy(state.workspaces[0].repositories[0].name[0..4], "Repo"); state.workspaces[0].repositories[0].name_len = 4;
    state.pairs[0] = .{ .key = .{ .workspace_id = wid, .repository_id = rid } };
    state.signals[0] = .{ .id = [_]u8{'s'} ** 36, .workspace_id = wid, .repository_id = rid, .status = .waiting, .read = false };
    for ([_]workspace.WorkspaceCompressionTier{ .wide, .medium, .narrow, .text_200 }) |tier| {
        const row = workspace.project(&state, tier).rows[0];
        try std.testing.expect(row.awaiting and row.unread);
        const description = row.accessible[0..row.accessible_len];
        try std.testing.expect(std.mem.indexOf(u8, description, "awaiting input") != null);
        try std.testing.expect(std.mem.indexOf(u8, description, "unread") != null);
    }
}

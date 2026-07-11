const std = @import("std");
const surface = @import("ghostty_surface");
const attention = @import("attention_view");
const model = @import("model");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

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
    var state:model.State=.{.attention_count=1};
    state.attention[0]=.{.id=id,.workspace_id=id,.status=.waiting};
    const p=attention.present(&state,id,null,null);
    try std.testing.expectEqual(@as(u32,1),p.unread);
    try std.testing.expect(p.icon.len>0 and p.label_len>0);
    try std.testing.expect(std.mem.indexOf(u8,p.label[0..p.label_len],"unread")!=null);
}

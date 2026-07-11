const std = @import("std");
const surface = @import("ghostty_surface");
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

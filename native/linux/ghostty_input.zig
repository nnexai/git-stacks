const c = @cImport({
    @cInclude("ghostty.h");
    @cInclude("gtk/gtk.h");
});
const clipboard = @import("ghostty_clipboard");

pub const Input = struct {
    context: *clipboard.Context,
    ime: *c.GtkIMContext,

    pub fn install(context: *clipboard.Context) !Input {
        const widget: *c.GtkWidget = @ptrCast(@alignCast(context.widget));
        const ime = c.gtk_im_multicontext_new() orelse return error.ImContextFailed;
        c.gtk_im_context_set_client_widget(ime, widget);
        _ = c.g_signal_connect_data(ime, "commit", @ptrCast(&imeCommit), context, null, 0);
        _ = c.g_signal_connect_data(ime, "preedit-changed", @ptrCast(&preeditChanged), context, null, 0);

        const keys = c.gtk_event_controller_key_new() orelse return error.KeyControllerFailed;
        _ = c.g_signal_connect_data(keys, "key-pressed", @ptrCast(&keyPressed), context, null, 0);
        _ = c.g_signal_connect_data(keys, "key-released", @ptrCast(&keyReleased), context, null, 0);
        c.gtk_widget_add_controller(widget, keys);

        const motion = c.gtk_event_controller_motion_new() orelse return error.MotionControllerFailed;
        _ = c.g_signal_connect_data(motion, "enter", @ptrCast(&pointerEnter), context, null, 0);
        _ = c.g_signal_connect_data(motion, "motion", @ptrCast(&pointerMotion), context, null, 0);
        _ = c.g_signal_connect_data(motion, "leave", @ptrCast(&pointerLeave), context, null, 0);
        c.gtk_widget_add_controller(widget, motion);

        const click = c.gtk_gesture_click_new() orelse return error.ClickControllerFailed;
        c.gtk_gesture_single_set_button(@ptrCast(click), 0);
        _ = c.g_signal_connect_data(click, "pressed", @ptrCast(&buttonPressed), context, null, 0);
        _ = c.g_signal_connect_data(click, "released", @ptrCast(&buttonReleased), context, null, 0);
        c.gtk_widget_add_controller(widget, @ptrCast(click));

        const scroll = c.gtk_event_controller_scroll_new(c.GTK_EVENT_CONTROLLER_SCROLL_BOTH_AXES | c.GTK_EVENT_CONTROLLER_SCROLL_DISCRETE) orelse return error.ScrollControllerFailed;
        _ = c.g_signal_connect_data(scroll, "scroll", @ptrCast(&scrolled), context, null, 0);
        c.gtk_widget_add_controller(widget, scroll);
        return .{ .context = context, .ime = ime };
    }

    pub fn deinit(self: *Input) void {
        c.gtk_im_context_set_client_widget(self.ime, null);
        c.g_object_unref(self.ime);
    }

    pub fn focusIn(self: *Input) void {
        c.gtk_im_context_focus_in(self.ime);
    }
    pub fn focusOut(self: *Input) void {
        c.gtk_im_context_focus_out(self.ime);
    }

    pub fn updateImePoint(self: *Input) void {
        const surface = self.context.surface orelse return;
        var x: f64 = 0;
        var y: f64 = 0;
        var width: f64 = 1;
        var height: f64 = 1;
        c.ghostty_surface_ime_point(surface, &x, &y, &width, &height);
        const rect = c.GdkRectangle{ .x = @intFromFloat(@round(x)), .y = @intFromFloat(@round(y)), .width = @max(1, @as(c_int, @intFromFloat(@round(width)))), .height = @max(1, @as(c_int, @intFromFloat(@round(height)))) };
        c.gtk_im_context_set_cursor_location(self.ime, &rect);
    }
};

fn mods(value: c.GdkModifierType) c.ghostty_input_mods_e {
    var out: c_int = c.GHOSTTY_MODS_NONE;
    if (value & c.GDK_SHIFT_MASK != 0) out |= c.GHOSTTY_MODS_SHIFT;
    if (value & c.GDK_CONTROL_MASK != 0) out |= c.GHOSTTY_MODS_CTRL;
    if (value & c.GDK_ALT_MASK != 0) out |= c.GHOSTTY_MODS_ALT;
    if (value & c.GDK_SUPER_MASK != 0) out |= c.GHOSTTY_MODS_SUPER;
    if (value & c.GDK_LOCK_MASK != 0) out |= c.GHOSTTY_MODS_CAPS;
    return @intCast(out);
}

fn eventMods(controller: *c.GtkEventController) c.ghostty_input_mods_e {
    return mods(c.gtk_event_controller_get_current_event_state(controller));
}
fn live(context: *clipboard.Context) c.ghostty_surface_t {
    return if (context.alive) context.surface else null;
}

fn keyPressed(controller: ?*c.GtkEventControllerKey, keyval: c.guint, keycode: c.guint, state: c.GdkModifierType, data: ?*anyopaque) callconv(.c) c.gboolean {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return 0));
    const surface = live(context) orelse return 0;
    const current = c.gtk_event_controller_get_current_event(@ptrCast(controller orelse return 0));
    if (current != null and c.gtk_im_context_filter_keypress(imFor(context), current) != 0) return 1;
    const cp = c.gdk_keyval_to_unicode(keyval);
    var utf8: [8]u8 = @splat(0);
    const len = if (cp != 0) c.g_unichar_to_utf8(cp, &utf8) else 0;
    var input = c.ghostty_input_key_s{
        .action = c.GHOSTTY_ACTION_PRESS,
        .mods = mods(state),
        .consumed_mods = if (current) |ev| mods(c.gdk_key_event_get_consumed_modifiers(ev)) else c.GHOSTTY_MODS_NONE,
        .keycode = keycode,
        .text = if (len > 0) &utf8 else null,
        .unshifted_codepoint = cp,
        .composing = false,
    };
    input.mods = c.ghostty_surface_key_translation_mods(surface, input.mods);
    return @intFromBool(c.ghostty_surface_key(surface, input));
}

fn keyReleased(controller: ?*c.GtkEventControllerKey, keyval: c.guint, keycode: c.guint, state: c.GdkModifierType, data: ?*anyopaque) callconv(.c) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    const surface = live(context) orelse return;
    const current = c.gtk_event_controller_get_current_event(@ptrCast(controller orelse return));
    if (current != null and c.gtk_im_context_filter_keypress(imFor(context), current) != 0) return;
    _ = c.ghostty_surface_key(surface, .{ .action = c.GHOSTTY_ACTION_RELEASE, .mods = mods(state), .consumed_mods = if (current) |ev| mods(c.gdk_key_event_get_consumed_modifiers(ev)) else c.GHOSTTY_MODS_NONE, .keycode = keycode, .text = null, .unshifted_codepoint = c.gdk_keyval_to_unicode(keyval), .composing = false });
}

// The IM context is stored immediately after the context by Surface and found
// through the qdata set during surface construction.
fn imFor(context: *clipboard.Context) *c.GtkIMContext {
    return @ptrCast(@alignCast(c.g_object_get_data(@ptrCast(@alignCast(context.widget)), "git-stacks-ime") orelse unreachable));
}
fn imeCommit(_: ?*c.GtkIMContext, text: ?[*:0]const u8, data: ?*anyopaque) callconv(.c) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    const surface = live(context) orelse return;
    const value = text orelse return;
    _ = c.ghostty_surface_key(surface, .{ .action = c.GHOSTTY_ACTION_PRESS, .mods = c.GHOSTTY_MODS_NONE, .consumed_mods = c.GHOSTTY_MODS_NONE, .keycode = 0, .text = value, .unshifted_codepoint = 0, .composing = true });
}
fn preeditChanged(ime: ?*c.GtkIMContext, data: ?*anyopaque) callconv(.c) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    const surface = live(context) orelse return;
    var text: [*c]u8 = null;
    var cursor: c_int = 0;
    c.gtk_im_context_get_preedit_string(ime orelse return, &text, null, &cursor);
    defer if (text != null) c.g_free(text);
    c.ghostty_surface_preedit(surface, text, @intCast(@max(0, cursor)));
}

fn pointerEnter(controller: ?*c.GtkEventControllerMotion, x: f64, y: f64, data: ?*anyopaque) callconv(.c) void {
    pointer(controller, x, y, data);
}
fn pointerMotion(controller: ?*c.GtkEventControllerMotion, x: f64, y: f64, data: ?*anyopaque) callconv(.c) void {
    pointer(controller, x, y, data);
}
fn pointer(controller: ?*c.GtkEventControllerMotion, x: f64, y: f64, data: ?*anyopaque) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    if (live(context)) |surface| c.ghostty_surface_mouse_pos(surface, x, y, eventMods(@ptrCast(controller orelse return)));
}
fn pointerLeave(_: ?*c.GtkEventControllerMotion, data: ?*anyopaque) callconv(.c) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    if (live(context)) |surface| c.ghostty_surface_mouse_pos(surface, -1, -1, c.GHOSTTY_MODS_NONE);
}
fn mouseButton(value: c.guint) c.ghostty_input_mouse_button_e {
    return switch (value) {
        1 => c.GHOSTTY_MOUSE_LEFT,
        2 => c.GHOSTTY_MOUSE_MIDDLE,
        3 => c.GHOSTTY_MOUSE_RIGHT,
        4 => c.GHOSTTY_MOUSE_FOUR,
        5 => c.GHOSTTY_MOUSE_FIVE,
        else => c.GHOSTTY_MOUSE_UNKNOWN,
    };
}
fn buttonPressed(gesture: ?*c.GtkGestureClick, _: c_int, x: f64, y: f64, data: ?*anyopaque) callconv(.c) void {
    button(gesture, c.GHOSTTY_MOUSE_PRESS, x, y, data);
}
fn buttonReleased(gesture: ?*c.GtkGestureClick, _: c_int, x: f64, y: f64, data: ?*anyopaque) callconv(.c) void {
    button(gesture, c.GHOSTTY_MOUSE_RELEASE, x, y, data);
}
fn button(gesture: ?*c.GtkGestureClick, state: c.ghostty_input_mouse_state_e, x: f64, y: f64, data: ?*anyopaque) void {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return));
    const surface = live(context) orelse return;
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(context.widget)));
    const g = gesture orelse return;
    const m = eventMods(@ptrCast(g));
    c.ghostty_surface_mouse_pos(surface, x, y, m);
    _ = c.ghostty_surface_mouse_button(surface, state, mouseButton(c.gtk_gesture_single_get_current_button(@ptrCast(g))), m);
}
fn scrolled(controller: ?*c.GtkEventControllerScroll, dx: f64, dy: f64, data: ?*anyopaque) callconv(.c) c.gboolean {
    const context: *clipboard.Context = @ptrCast(@alignCast(data orelse return 0));
    const surface = live(context) orelse return 0;
    c.ghostty_surface_mouse_scroll(surface, -dx, -dy, @intCast(eventMods(@ptrCast(controller orelse return 0))));
    return 1;
}

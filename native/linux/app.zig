const std = @import("std");
const widget_mod = @import("terminal_widget");
const runtime_mod = @import("runtime");
const input_mod = @import("input");
const appearance_config = @import("appearance_config");
const vt = @import("vt_adapter");
const c = @cImport({ @cInclude("gtk/gtk.h"); });

const AppState = struct {
    allocator: std.mem.Allocator,
    runtime: runtime_mod.TerminalRuntime,
    input: input_mod.Input,
    widget: widget_mod.TerminalWidget,
    im: *c.GtkIMContext,
    pump_source: c.guint = 0,
    cleaned: bool = false,
    appearance: appearance_config.Appearance,
    drag_origin_x: f64 = 0,
    drag_origin_y: f64 = 0,
};

var active_state: ?*AppState = null;

fn commandForLaunch() [*:0]const u8 {
    if (std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null)
        return "stty raw -echo; printf '\\033[c'; response=$(dd bs=1 count=9 2>/dev/null); stty sane; [ \"$response\" = \"$(printf '\\033[?62;22c')\" ] && printf 'DA_RESPONSE_OK\\n'; printf '\\033[?1049hALT_SCREEN_UNIQUE\\033[?1049lSHELL_PROMPT_UNIQUE\\n'; read line; printf 'SHELL_RESULT_UNIQUE:%s\\n' \"$line\"; sleep 1";
    if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null)
        return "printf 'git-stacks native terminal ready\\n'; sleep 3600";
    if (std.posix.getenv("GIT_STACKS_NATIVE_STATIC_FIXTURE") != null)
        return "printf 'git-stacks explicit static fixture\n'; sleep 3600";
    return "exec \"${SHELL:-/bin/sh}\" -l";
}

fn sendCommitted(state: *AppState, text: []const u8) bool {
    state.input.commit(text) catch return false;
    return true;
}

fn pumpTimer(data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *AppState = @ptrCast(@alignCast(data orelse return 0));
    if (state.cleaned or !state.runtime.live) return 0;
    const read = state.runtime.pump() catch return 1;
    if (read > 0) _ = state.widget.queueRedraw(state.widget.callbackToken());
    return 1;
}

fn keyPressed(controller: ?*c.GtkEventControllerKey, keyval: c.guint, _: c.guint, modifiers: c.GdkModifierType, data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *AppState = @ptrCast(@alignCast(data orelse return 0));
    if (controller) |ctl| if (c.gtk_event_controller_get_current_event(@ptrCast(ctl))) |event| {
        if (c.gtk_im_context_filter_keypress(state.im, event) != 0) return 1;
    };
    if ((modifiers & c.GDK_CONTROL_MASK) != 0 and (modifiers & c.GDK_SHIFT_MASK) != 0) {
        if (keyval == c.GDK_KEY_c or keyval == c.GDK_KEY_C) { copySelection(state); return 1; }
        if (keyval == c.GDK_KEY_v or keyval == c.GDK_KEY_V) { requestPaste(state, false); return 1; }
    }
    const special: ?vt.Key = switch (keyval) {
        c.GDK_KEY_Return, c.GDK_KEY_KP_Enter => .enter,
        c.GDK_KEY_Tab, c.GDK_KEY_ISO_Left_Tab => .tab,
        c.GDK_KEY_Escape => .escape,
        c.GDK_KEY_BackSpace => .backspace,
        c.GDK_KEY_Up => .up,
        c.GDK_KEY_Down => .down,
        c.GDK_KEY_Left => .left,
        c.GDK_KEY_Right => .right,
        else => null,
    };
    if (special) |key| { state.input.key(key) catch return 0; return 1; }
    const codepoint = c.gdk_keyval_to_unicode(keyval);
    if (codepoint == 0) return 0;
    if ((modifiers & c.GDK_CONTROL_MASK) != 0 and codepoint >= 'a' and codepoint <= 'z') {
        const control = [_]u8{@intCast(codepoint - 'a' + 1)};
        return @intFromBool(sendCommitted(state, &control));
    }
    var bytes: [4]u8 = undefined;
    const length = std.unicode.utf8Encode(@intCast(codepoint), &bytes) catch return 0;
    return @intFromBool(sendCommitted(state, bytes[0..length]));
}

fn copySelection(state: *AppState) void {
    const text_value = state.widget.selectionText(state.allocator) catch return orelse return; defer state.allocator.free(text_value);
    const terminated = state.allocator.dupeZ(u8, text_value) catch return; defer state.allocator.free(terminated);
    const display = c.gtk_widget_get_display(@ptrCast(@alignCast(state.widget.widget))) orelse return;
    c.gdk_clipboard_set_text(c.gdk_display_get_clipboard(display), terminated.ptr);
    c.gdk_clipboard_set_text(c.gdk_display_get_primary_clipboard(display), terminated.ptr);
}
const PasteRequest = struct { state: *AppState, generation: u64 };
fn pasteReady(source: ?*c.GObject, result: ?*c.GAsyncResult, data: ?*anyopaque) callconv(.c) void {
    const request: *PasteRequest = @ptrCast(@alignCast(data orelse return)); defer request.state.allocator.destroy(request);
    const state = request.state; if (state.cleaned or request.generation != state.runtime.generation) return;
    var err: ?*c.GError = null; const raw = c.gdk_clipboard_read_text_finish(@ptrCast(source), result, &err);
    defer if (err) |value| c.g_error_free(value); defer if (raw) |value| c.g_free(value);
    if (raw) |value| state.input.paste(std.mem.span(value), true) catch {};
}
fn requestPaste(state: *AppState, primary: bool) void {
    if (state.cleaned) return; const display = c.gtk_widget_get_display(@ptrCast(@alignCast(state.widget.widget))) orelse return;
    const request = state.allocator.create(PasteRequest) catch return; request.* = .{ .state = state, .generation = state.runtime.generation };
    const clipboard = if (primary) c.gdk_display_get_primary_clipboard(display) else c.gdk_display_get_clipboard(display);
    c.gdk_clipboard_read_text_async(clipboard, null, pasteReady, request);
}
fn dragBegin(_: ?*c.GtkGestureDrag, x: f64, y: f64, data: ?*anyopaque) callconv(.c) void { const state: *AppState = @ptrCast(@alignCast(data orelse return)); state.drag_origin_x = x; state.drag_origin_y = y; state.widget.selectionBegin(state.widget.pointFromPixels(x, y)); }
fn dragUpdate(_: ?*c.GtkGestureDrag, dx: f64, dy: f64, data: ?*anyopaque) callconv(.c) void { const state: *AppState = @ptrCast(@alignCast(data orelse return)); state.widget.selectionUpdate(state.widget.pointFromPixels(state.drag_origin_x + dx, state.drag_origin_y + dy)); }
fn dragEnd(_: ?*c.GtkGestureDrag, dx: f64, dy: f64, data: ?*anyopaque) callconv(.c) void { const state: *AppState = @ptrCast(@alignCast(data orelse return)); state.widget.selectionUpdate(state.widget.pointFromPixels(state.drag_origin_x + dx, state.drag_origin_y + dy)); copySelection(state); }
fn middlePressed(_: ?*c.GtkGestureClick, _: c_int, _: f64, _: f64, data: ?*anyopaque) callconv(.c) void { const state: *AppState = @ptrCast(@alignCast(data orelse return)); requestPaste(state, true); }

fn imCommit(_: ?*c.GtkIMContext, text: ?[*:0]const u8, data: ?*anyopaque) callconv(.c) void {
    const state: *AppState = @ptrCast(@alignCast(data orelse return));
    if (text) |value| _ = sendCommitted(state, std.mem.span(value));
}

fn imPreeditChanged(context: ?*c.GtkIMContext, data: ?*anyopaque) callconv(.c) void {
    const state: *AppState = @ptrCast(@alignCast(data orelse return));
    var text: [*c]u8 = null;
    var attrs: ?*c.PangoAttrList = null;
    var cursor: c_int = 0;
    c.gtk_im_context_get_preedit_string(context, &text, &attrs, &cursor);
    defer if (text != null) c.g_free(text);
    defer if (attrs) |value| c.pango_attr_list_unref(value);
    state.input.setPreedit(if (text != null) std.mem.span(@as([*:0]u8, @ptrCast(text))) else "") catch {};
}

fn focusEnter(_: ?*c.GtkEventControllerFocus, data: ?*anyopaque) callconv(.c) void {
    const state: *AppState = @ptrCast(@alignCast(data orelse return));
    c.gtk_im_context_focus_in(state.im);
}
fn focusLeave(_: ?*c.GtkEventControllerFocus, data: ?*anyopaque) callconv(.c) void {
    const state: *AppState = @ptrCast(@alignCast(data orelse return));
    c.gtk_im_context_focus_out(state.im);
}
fn resized(_: ?*c.GtkDrawingArea, width: c_int, height: c_int, data: ?*anyopaque) callconv(.c) void {
    const state: *AppState = @ptrCast(@alignCast(data orelse return));
    if (width > 0 and height > 0) state.widget.resize(width, height) catch {};
}

fn cleanup(state: *AppState) void {
    if (state.cleaned) return;
    state.cleaned = true;
    if (state.pump_source != 0) { _ = c.g_source_remove(state.pump_source); state.pump_source = 0; }
    c.gtk_im_context_focus_out(state.im);
    state.input.deinit();
    state.runtime.close(); state.appearance.deinit();
    c.g_object_unref(state.im);
}

fn closeRequested(_: ?*c.GtkWindow, data: ?*anyopaque) callconv(.c) c.gboolean {
    const state: *AppState = @ptrCast(@alignCast(data orelse return 0));
    cleanup(state);
    return 0;
}

fn quitTimer(data: ?*anyopaque) callconv(.c) c.gboolean {
    const app: *c.GApplication = @ptrCast(@alignCast(data.?));
    c.g_application_quit(app);
    return c.G_SOURCE_REMOVE;
}

fn activate(raw_app: ?*c.GtkApplication, _: ?*anyopaque) callconv(.c) void {
    const app = raw_app orelse return;
    const allocator = std.heap.c_allocator;
    const state = allocator.create(AppState) catch return;
    var runtime = runtime_mod.TerminalRuntime.init(allocator, commandForLaunch(), 80, 24) catch { allocator.destroy(state); return; };
    errdefer runtime.close();
    state.allocator = allocator;
    state.appearance = appearance_config.load(allocator) catch appearance_config.Appearance.init(allocator) catch { runtime.close(); allocator.destroy(state); return; };
    state.runtime = runtime;
    state.input = input_mod.Input.init(&state.runtime);
    state.widget = widget_mod.TerminalWidget.initAppearance(&state.runtime.terminal, state.appearance.primaryFamily(), state.appearance.font_size) catch { state.input.deinit(); state.runtime.close(); state.appearance.deinit(); allocator.destroy(state); return; };
    state.im = c.gtk_im_multicontext_new() orelse return;
    state.pump_source = 0;
    state.cleaned = false;
    state.drag_origin_x = 0; state.drag_origin_y = 0;
    active_state = state;

    const key = c.gtk_event_controller_key_new() orelse return;
    _ = c.g_signal_connect_data(key, "key-pressed", @ptrCast(&keyPressed), state, null, 0);
    c.gtk_widget_add_controller(@ptrCast(@alignCast(state.widget.widget)), key);
    const focus = c.gtk_event_controller_focus_new() orelse return;
    _ = c.g_signal_connect_data(focus, "enter", @ptrCast(&focusEnter), state, null, 0);
    _ = c.g_signal_connect_data(focus, "leave", @ptrCast(&focusLeave), state, null, 0);
    c.gtk_widget_add_controller(@ptrCast(@alignCast(state.widget.widget)), focus);
    const drag = c.gtk_gesture_drag_new() orelse return;
    c.gtk_gesture_single_set_button(@ptrCast(drag), c.GDK_BUTTON_PRIMARY);
    _ = c.g_signal_connect_data(drag, "drag-begin", @ptrCast(&dragBegin), state, null, 0);
    _ = c.g_signal_connect_data(drag, "drag-update", @ptrCast(&dragUpdate), state, null, 0);
    _ = c.g_signal_connect_data(drag, "drag-end", @ptrCast(&dragEnd), state, null, 0);
    c.gtk_widget_add_controller(@ptrCast(@alignCast(state.widget.widget)), @ptrCast(drag));
    const middle = c.gtk_gesture_click_new() orelse return;
    c.gtk_gesture_single_set_button(@ptrCast(middle), c.GDK_BUTTON_MIDDLE);
    _ = c.g_signal_connect_data(middle, "pressed", @ptrCast(&middlePressed), state, null, 0);
    c.gtk_widget_add_controller(@ptrCast(@alignCast(state.widget.widget)), @ptrCast(middle));
    _ = c.g_signal_connect_data(state.im, "commit", @ptrCast(&imCommit), state, null, 0);
    _ = c.g_signal_connect_data(state.im, "preedit-changed", @ptrCast(&imPreeditChanged), state, null, 0);
    _ = c.g_signal_connect_data(state.widget.widget, "resize", @ptrCast(&resized), state, null, 0);

    const window = c.gtk_application_window_new(app) orelse return;
    _ = c.g_signal_connect_data(window, "close-request", @ptrCast(&closeRequested), state, null, 0);
    c.gtk_window_set_title(@ptrCast(window), "git-stacks terminal");
    c.gtk_window_set_default_size(@ptrCast(window), 900, 540);
    c.gtk_window_set_child(@ptrCast(window), @ptrCast(@alignCast(state.widget.widget)));
    c.gtk_window_present(@ptrCast(window));
    _ = c.gtk_widget_grab_focus(@ptrCast(@alignCast(state.widget.widget)));
    c.gtk_im_context_focus_in(state.im);
    state.pump_source = c.g_timeout_add(8, pumpTimer, state);

    if (std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null) {
        var attempts: usize = 0;
        while (attempts < 400 and !(state.runtime.frameContains("SHELL_PROMPT_UNIQUE") catch false)) : (attempts += 1) {
            _ = c.g_main_context_iteration(null, 0);
            std.Thread.sleep(5 * std.time.ns_per_ms);
        }
        _ = sendCommitted(state, "widget-input-path\n");
        attempts = 0;
        while (attempts < 400 and !(state.runtime.frameContains("SHELL_RESULT_UNIQUE:widget-input-path") catch false)) : (attempts += 1) {
            _ = c.g_main_context_iteration(null, 0);
            std.Thread.sleep(5 * std.time.ns_per_ms);
        }
    }
    var iterations: usize = 0;
    while (iterations < 100 and state.widget.paintedCellCount() == 0) : (iterations += 1) {
        _ = c.g_main_context_iteration(null, 0);
        std.Thread.sleep(5 * std.time.ns_per_ms);
    }
    if (state.widget.drawCount() == 0 or state.widget.paintedCellCount() == 0 or state.widget.cursorDrawCount() == 0) { std.debug.print("GIT_STACKS_NATIVE_BLANK draws={d} cells={d} cursor={d}\n", .{ state.widget.drawCount(), state.widget.paintedCellCount(), state.widget.cursorDrawCount() }); return; }
    std.debug.print("GIT_STACKS_NATIVE_READY composition=pty-runtime input=gtk-controller text=git-stacks-native-terminal-ready font_family={s} font_size={d:.2} config_diagnostics={d} focused={d} draws={d} painted_cells={d} cursor_draws={d}\n", .{ state.appearance.primaryFamily(), state.appearance.font_size, state.appearance.diagnostics, c.gtk_widget_has_focus(@ptrCast(@alignCast(state.widget.widget))), state.widget.drawCount(), state.widget.paintedCellCount(), state.widget.cursorDrawCount() });
    if (std.posix.getenv("GIT_STACKS_NATIVE_TERMINAL_SMOKE") != null and state.runtime.frameContains("SHELL_RESULT_UNIQUE:widget-input-path") catch false)
        std.debug.print("GIT_STACKS_TERMINAL_ROUNDTRIP marker=SHELL_RESULT_UNIQUE query=DA_RESPONSE_OK input=gtk-commit-path resources=owned\n", .{});
    if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) _ = c.g_timeout_add(250, quitTimer, @ptrCast(app));
}

fn shutdown(_: ?*c.GApplication, _: ?*anyopaque) callconv(.c) void {
    if (active_state) |state| { cleanup(state); active_state = null; }
}

pub fn main() u8 {
    const flags: c.GApplicationFlags = @intCast(if (std.posix.getenv("GIT_STACKS_NATIVE_SMOKE") != null) c.G_APPLICATION_NON_UNIQUE else c.G_APPLICATION_DEFAULT_FLAGS);
    const app = c.gtk_application_new("dev.nnex.git-stacks.terminal", flags) orelse return 2;
    defer c.g_object_unref(app);
    _ = c.g_signal_connect_data(app, "activate", @ptrCast(&activate), null, null, 0);
    _ = c.g_signal_connect_data(app, "shutdown", @ptrCast(&shutdown), null, null, 0);
    const code = c.g_application_run(@ptrCast(app), 0, null);
    return @intCast(@min(code, 255));
}

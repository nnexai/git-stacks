const std = @import("std");
const ghostty = @cImport({ @cInclude("ghostty.h"); });

comptime {
    for (.{
        ghostty.ghostty_app_new, ghostty.ghostty_app_free, ghostty.ghostty_app_tick,
        ghostty.ghostty_config_new, ghostty.ghostty_config_free,
        ghostty.ghostty_config_load_default_files, ghostty.ghostty_config_load_recursive_files,
        ghostty.ghostty_config_finalize, ghostty.ghostty_config_get,
        ghostty.ghostty_surface_new, ghostty.ghostty_surface_free, ghostty.ghostty_surface_draw,
        ghostty.ghostty_surface_display_realized, ghostty.ghostty_surface_display_unrealized,
        ghostty.ghostty_surface_set_size, ghostty.ghostty_surface_set_content_scale,
        ghostty.ghostty_surface_set_focus, ghostty.ghostty_surface_key, ghostty.ghostty_surface_text,
        ghostty.ghostty_surface_preedit, ghostty.ghostty_surface_mouse_button,
        ghostty.ghostty_surface_mouse_pos, ghostty.ghostty_surface_mouse_scroll,
        ghostty.ghostty_surface_ime_point, ghostty.ghostty_surface_complete_clipboard_request,
        ghostty.ghostty_surface_process_exited, ghostty.ghostty_surface_request_close,
        ghostty.ghostty_surface_process_identity, ghostty.ghostty_surface_process_graceful_close,
        ghostty.ghostty_surface_process_signal_group, ghostty.ghostty_surface_process_reap,
        ghostty.ghostty_surface_process_absent,
    }) |symbol| _ = @TypeOf(symbol);
    if (@sizeOf(ghostty.ghostty_process_identity_s) != 16) @compileError("unexpected process identity ABI size");
}

fn controlIdentityAllowed(identity: ghostty.ghostty_process_identity_s, current: ghostty.ghostty_process_identity_s, client_pgid: i32, guard_pgid: i32) bool {
    if (identity.pid <= 1 or identity.pgid <= 1 or identity.linux_birth_token == 0) return false;
    if (identity.pgid == client_pgid or identity.pgid == guard_pgid) return false;
    return std.meta.eql(identity, current);
}

var initialized = false;
fn ensureInitialized() !void {
    if (initialized) return;
    var argv = [_][*:0]u8{@constCast("git-stacks-native")};
    if (ghostty.ghostty_init(argv.len, @ptrCast(&argv)) != 0) return error.GhosttyInitFailed;
    initialized = true;
}

test "identity control rejects self, client, guard, stale token, and pid reuse" {
    const current: ghostty.ghostty_process_identity_s = .{ .pid = 4100, .pgid = 4100, .linux_birth_token = 9001 };
    try std.testing.expect(controlIdentityAllowed(current, current, 4000, 4001));
    try std.testing.expect(!controlIdentityAllowed(.{ .pid = 4100, .pgid = 4000, .linux_birth_token = 9001 }, current, 4000, 4001));
    try std.testing.expect(!controlIdentityAllowed(.{ .pid = 4100, .pgid = 4001, .linux_birth_token = 9001 }, current, 4000, 4001));
    try std.testing.expect(!controlIdentityAllowed(.{ .pid = 4100, .pgid = 4100, .linux_birth_token = 9000 }, current, 4000, 4001));
    try std.testing.expect(!controlIdentityAllowed(.{ .pid = 4101, .pgid = 4100, .linux_birth_token = 9001 }, current, 4000, 4001));
    try std.testing.expect(!controlIdentityAllowed(.{ .pid = 0, .pgid = 0, .linux_birth_token = 0 }, current, 4000, 4001));
}

test "configuration lifecycle executes through linked full library" {
    try ensureInitialized();
    const config = ghostty.ghostty_config_new() orelse return error.ConfigInitFailed;
    defer ghostty.ghostty_config_free(config);
    ghostty.ghostty_config_load_default_files(config);
    ghostty.ghostty_config_load_recursive_files(config);
    ghostty.ghostty_config_finalize(config);
}

pub fn main() !void {
    try ensureInitialized();
    const config = ghostty.ghostty_config_new() orelse return error.ConfigInitFailed;
    ghostty.ghostty_config_finalize(config);
    ghostty.ghostty_config_free(config);
}

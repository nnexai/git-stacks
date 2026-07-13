const std = @import("std");

pub const Provider = enum { codex, claude, copilot, opencode };
pub const State = enum { working, waiting, completed, failed, idle };
pub const Event = struct { provider: Provider, session: []const u8, state: State };

const prefix = "git-stacks-signal:";

/// Decode the bounded OSC 9 body emitted by an app-owned provider hook. The
/// receiving Ghostty surface supplies attribution; a payload can never select
/// another surface. The per-surface token prevents ordinary terminal output
/// from forging lifecycle events.
pub fn parse(body: []const u8, expected_token: []const u8) ?Event {
    if (body.len > 256 or expected_token.len != 32 or !std.mem.startsWith(u8, body, prefix)) return null;
    var fields = std.mem.splitScalar(u8, body[prefix.len..], ':');
    const token = fields.next() orelse return null;
    const provider_raw = fields.next() orelse return null;
    const session = fields.next() orelse return null;
    const state_raw = fields.next() orelse return null;
    if (fields.next() != null or token.len != 32 or session.len == 0 or session.len > 96 or !std.mem.eql(u8, token, expected_token)) return null;
    return .{
        .provider = std.meta.stringToEnum(Provider, provider_raw) orelse return null,
        .session = session,
        .state = std.meta.stringToEnum(State, state_raw) orelse return null,
    };
}

test "accepts authenticated bounded events and rejects spoofing" {
    const token = "0123456789abcdef0123456789abcdef";
    const event = parse("git-stacks-signal:0123456789abcdef0123456789abcdef:codex:session-a:waiting", token).?;
    try std.testing.expectEqual(Provider.codex, event.provider);
    try std.testing.expectEqual(State.waiting, event.state);
    try std.testing.expectEqualStrings("session-a", event.session);
    try std.testing.expect(parse("git-stacks-signal:1123456789abcdef0123456789abcdef:codex:session-a:waiting", token) == null);
    try std.testing.expect(parse("git-stacks-signal:0123456789abcdef0123456789abcdef:codex:session-a:waiting:extra", token) == null);
}

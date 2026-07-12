const std = @import("std");

pub const Provider = enum { codex, claude, copilot, opencode };
pub const State = enum { working, waiting, completed, failed, idle };
pub const Event = struct { provider: Provider, state: State };

const prefix = "git-stacks-attention:";

/// Decode the bounded OSC 9 body emitted by an app-owned provider hook. The
/// receiving Ghostty surface supplies attribution; a payload can never select
/// another surface. The per-surface token prevents ordinary terminal output
/// from forging lifecycle events.
pub fn parse(body: []const u8, expected_token: []const u8) ?Event {
    if (body.len > 256 or expected_token.len != 32 or !std.mem.startsWith(u8, body, prefix)) return null;
    var fields = std.mem.splitScalar(u8, body[prefix.len..], ':');
    const token = fields.next() orelse return null;
    const provider_raw = fields.next() orelse return null;
    const state_raw = fields.next() orelse return null;
    if (fields.next() != null or token.len != 32 or !std.mem.eql(u8, token, expected_token)) return null;
    return .{
        .provider = std.meta.stringToEnum(Provider, provider_raw) orelse return null,
        .state = std.meta.stringToEnum(State, state_raw) orelse return null,
    };
}

test "accepts authenticated bounded events and rejects spoofing" {
    const token = "0123456789abcdef0123456789abcdef";
    const event = parse("git-stacks-attention:0123456789abcdef0123456789abcdef:codex:waiting", token).?;
    try std.testing.expectEqual(Provider.codex, event.provider);
    try std.testing.expectEqual(State.waiting, event.state);
    try std.testing.expect(parse("git-stacks-attention:1123456789abcdef0123456789abcdef:codex:waiting", token) == null);
    try std.testing.expect(parse("git-stacks-attention:0123456789abcdef0123456789abcdef:codex:waiting:extra", token) == null);
}

const std = @import("std");

pub const Domain = enum { workspace, repository, command, operation, surface, attention };
pub const PairKey = struct { workspace: [36]u8, repository: [36]u8 };

pub fn isUuid(value: []const u8) bool {
    if (value.len != 36) return false;
    for (value, 0..) |c, i| {
        if (i == 8 or i == 13 or i == 18 or i == 23) {
            if (c != '-') return false;
        } else if (!std.ascii.isHex(c)) return false;
    }
    return true;
}

pub fn isPrefixed(value: []const u8, prefix: []const u8) bool {
    if (!std.mem.startsWith(u8, value, prefix) or value.len < prefix.len + 16) return false;
    for (value[prefix.len..]) |c| if (!(std.ascii.isAlphanumeric(c) or c == '_' or c == '-')) return false;
    return true;
}

pub fn isDecimal(value: []const u8) bool {
    if (value.len == 0 or (value.len > 1 and value[0] == '0')) return false;
    for (value) |c| if (!std.ascii.isDigit(c)) return false;
    return true;
}

test "identity domains remain strict and opaque" {
    try std.testing.expect(isUuid("018f47f4-5ab1-7c2d-8e90-123456789abc"));
    try std.testing.expect(!isUuid("req_0123456789abcdef"));
    try std.testing.expect(isPrefixed("req_0123456789abcdef", "req_"));
    try std.testing.expect(isPrefixed("op_0123456789abcdef", "op_"));
    try std.testing.expect(isDecimal("0"));
    try std.testing.expect(!isDecimal("07"));
}

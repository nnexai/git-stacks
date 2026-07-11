const std = @import("std");
const identity = @import("identity.zig");

pub const max_input_bytes: usize = 1024 * 1024;

pub const ContractError = error{ InvalidLength, InvalidUtf8, InvalidJson, VersionMismatch, InvalidIdentity };

pub fn validate(bytes: []const u8) ContractError!void {
    if (bytes.len == 0 or bytes.len > max_input_bytes) return error.InvalidLength;
    if (!std.unicode.utf8ValidateSlice(bytes)) return error.InvalidUtf8;
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, bytes, .{}) catch return error.InvalidJson;
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidJson;
    const object = parsed.value.object;
    const protocol = object.get("protocol") orelse return error.VersionMismatch;
    if (protocol != .string or !std.mem.eql(u8, protocol.string, "v1")) return error.VersionMismatch;
    try validateKnownIdentities(parsed.value);
}

fn validateKnownIdentities(value: std.json.Value) ContractError!void {
    switch (value) {
        .object => |object| {
            var it = object.iterator();
            while (it.next()) |entry| {
                const child = entry.value_ptr.*;
                if (std.mem.eql(u8, entry.key_ptr.*, "request_id")) {
                    if (child != .string or !identity.isPrefixed(child.string, "req_")) return error.InvalidIdentity;
                } else if (std.mem.eql(u8, entry.key_ptr.*, "operation_id")) {
                    if (child != .string or !identity.isPrefixed(child.string, "op_")) return error.InvalidIdentity;
                } else if (std.mem.eql(u8, entry.key_ptr.*, "workspace_id") or std.mem.eql(u8, entry.key_ptr.*, "repository_id")) {
                    if (child != .string or !identity.isUuid(child.string)) return error.InvalidIdentity;
                } else if (std.mem.eql(u8, entry.key_ptr.*, "revision") or std.mem.eql(u8, entry.key_ptr.*, "sequence")) {
                    if (child != .string or !identity.isDecimal(child.string)) return error.InvalidIdentity;
                }
                try validateKnownIdentities(child);
            }
        },
        .array => |array| for (array.items) |child| try validateKnownIdentities(child),
        else => {},
    }
}

test "canonical contract bytes validate without rewriting" {
    try validate("{\"protocol\":\"v1\",\"request_id\":\"req_0123456789abcdef\",\"ok\":true}");
    try std.testing.expectError(error.VersionMismatch, validate("{\"protocol\":\"v2\"}"));
    try std.testing.expectError(error.InvalidIdentity, validate("{\"protocol\":\"v1\",\"request_id\":\"bad\"}"));
}

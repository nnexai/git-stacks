const std = @import("std");

pub const Connection = enum { disconnected_no_snapshot, connecting, ready, stale, refresh_required, incompatible, failed };
pub const Lifecycle = enum { live, ended, failed_cleanup };

pub const Surface = struct {
    id: [36]u8,
    predecessor_surface_id: ?[36]u8 = null,
    lifecycle: Lifecycle = .ended,
    order: u32 = 0,
};

pub const State = struct {
    connection: Connection = .disconnected_no_snapshot,
    revision: u64 = 0,
    sequence: u64 = 0,
    has_snapshot: bool = false,
    degraded_optional_count: u32 = 0,
    duplicate_count: u32 = 0,
    surface: ?Surface = null,
    attention_id: ?[36]u8 = null,
};

pub fn canonicalAlloc(allocator: std.mem.Allocator, state: State) ![]u8 {
    const surface_id = if (state.surface) |surface| surface.id[0..] else "";
    const predecessor = if (state.surface) |surface| if (surface.predecessor_surface_id) |id| id[0..] else "" else "";
    return std.fmt.allocPrint(allocator,
        "{{\"connection\":\"{s}\",\"revision\":{d},\"sequence\":{d},\"has_snapshot\":{},\"degraded_optional_count\":{d},\"duplicate_count\":{d},\"surface_id\":\"{s}\",\"predecessor_surface_id\":\"{s}\"}}",
        .{ @tagName(state.connection), state.revision, state.sequence, state.has_snapshot, state.degraded_optional_count, state.duplicate_count, surface_id, predecessor });
}

test "canonical state serialization is stable" {
    const one = try canonicalAlloc(std.testing.allocator, .{ .connection = .ready, .revision = 3, .sequence = 9, .has_snapshot = true });
    defer std.testing.allocator.free(one);
    const two = try canonicalAlloc(std.testing.allocator, .{ .connection = .ready, .revision = 3, .sequence = 9, .has_snapshot = true });
    defer std.testing.allocator.free(two);
    try std.testing.expectEqualStrings(one, two);
}

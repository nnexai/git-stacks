const std = @import("std");
pub const model = @import("model.zig");

pub const Action = union(enum) {
    connected: struct { revision: u64, sequence: u64 },
    disconnected,
    event: struct { revision: u64, sequence: u64 },
    refreshed: struct { revision: u64, sequence: u64 },
    incompatible,
    unknown_optional,
    relaunch: struct { new_surface_id: [36]u8 },
};

pub const Effect = union(enum) { none, refresh_service, persist, terminal_create: struct { id: [36]u8, predecessor: [36]u8 }, platform_focus: [36]u8 };
pub const Result = struct { state: model.State, effect: Effect = .none };

pub fn reduce(before: model.State, action: Action) Result {
    var state = before;
    var effect: Effect = .none;
    switch (action) {
        .connected => |a| {
            if (a.sequence <= state.sequence) state.duplicate_count += 1 else {
                state.connection = .ready; state.revision = a.revision; state.sequence = a.sequence; state.has_snapshot = true;
            }
        },
        .disconnected => state.connection = if (state.has_snapshot) .stale else .disconnected_no_snapshot,
        .event => |a| {
            if (a.sequence <= state.sequence) state.duplicate_count += 1 else if (a.sequence != state.sequence + 1 or a.revision > state.revision) {
                state.connection = .refresh_required; effect = .refresh_service;
            } else state.sequence = a.sequence;
        },
        .refreshed => |a| { state.connection = .ready; state.has_snapshot = true; state.revision = a.revision; state.sequence = a.sequence; },
        .incompatible => { state.connection = .incompatible; state.has_snapshot = false; state.revision = 0; state.sequence = 0; },
        .unknown_optional => state.degraded_optional_count += 1,
        .relaunch => |a| if (state.surface) |old| {
            if (old.lifecycle == .ended and !std.mem.eql(u8, &a.new_surface_id, &old.id)) {
                state.surface = .{ .id = a.new_surface_id, .predecessor_surface_id = old.id, .lifecycle = .live, .order = old.order };
                effect = .{ .terminal_create = .{ .id = a.new_surface_id, .predecessor = old.id } };
            }
        },
    }
    return .{ .state = state, .effect = effect };
}

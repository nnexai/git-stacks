const std = @import("std");
pub const model = @import("model");

pub const Action = union(enum) {
    snapshot: model.State,
    connected: struct { revision: u64, sequence: u64 },
    disconnected,
    event: struct { revision: u64, sequence: u64 },
    refreshed: struct { revision: u64, sequence: u64 },
    incompatible,
    unknown_optional,
    relaunch: struct { new_surface_id: [36]u8 },
    terminal_ended: struct { surface_id: [36]u8, generation: u64 },
    terminal_failed_cleanup: struct { surface_id: [36]u8, generation: u64 },
    attention_received: model.Attention,
    select_attention: struct { attention_id: model.Id },
    exact_tab_visible: struct { surface_id: model.Id },
    remove_attention: struct { attention_id: model.Id },
    navigate_pair: model.PairKey,
};

pub const Effect = union(enum) { none, refresh_service, persist, terminal_create: struct { id: [36]u8, predecessor: [36]u8 }, platform_focus: model.FocusRoute };
pub const Result = struct { state: model.State, effect: Effect = .none };

pub fn reduce(before: model.State, action: Action) Result {
    var state = before;
    var effect: Effect = .none;
    switch (action) {
        .snapshot => |snapshot| {
            state = snapshot;
            model.reconcile(&state);
        },
        .connected => |a| {
            if (a.sequence <= state.sequence) state.duplicate_count += 1 else {
                state.connection = .ready;
                state.revision = a.revision;
                state.sequence = a.sequence;
                state.has_snapshot = true;
            }
        },
        .disconnected => state.connection = if (state.has_snapshot) .stale else .disconnected_no_snapshot,
        .event => |a| {
            if (a.sequence <= state.sequence) state.duplicate_count += 1 else if (a.sequence != state.sequence + 1 or a.revision > state.revision) {
                state.connection = .refresh_required;
                effect = .refresh_service;
            } else state.sequence = a.sequence;
        },
        .refreshed => |a| {
            state.connection = .ready;
            state.has_snapshot = true;
            state.revision = a.revision;
            state.sequence = a.sequence;
        },
        .incompatible => {
            state.connection = .incompatible;
            state.has_snapshot = false;
            state.revision = 0;
            state.sequence = 0;
        },
        .unknown_optional => state.degraded_optional_count += 1,
        .relaunch => |a| if (state.surface) |old| {
            if (old.lifecycle == .ended and !std.mem.eql(u8, &a.new_surface_id, &old.id)) {
                state.surface = .{ .id = a.new_surface_id, .generation = old.generation +% 1, .predecessor_surface_id = old.id, .lifecycle = .live, .order = old.order };
                effect = .{ .terminal_create = .{ .id = a.new_surface_id, .predecessor = old.id } };
            }
        },
        .terminal_ended => |a| if (state.surface) |*surface| {
            if (std.mem.eql(u8, &a.surface_id, &surface.id) and a.generation == surface.generation and surface.lifecycle == .live) {
                surface.lifecycle = .ended;
                effect = .persist;
            }
        },
        .terminal_failed_cleanup => |a| if (state.surface) |*surface| {
            if (std.mem.eql(u8, &a.surface_id, &surface.id) and a.generation == surface.generation and surface.lifecycle != .ended) {
                surface.lifecycle = .failed_cleanup;
                effect = .persist;
            }
        },
        .attention_received => |item| {
            var received = item;
            received.resolved = if (item.repository_id) |rid| model.pairValid(&state, .{ .workspace_id = item.workspace_id, .repository_id = rid }) else model.workspaceValid(&state, item.workspace_id);
            var updated = false;
            for (state.attention[0..state.attention_count]) |*existing| if (std.mem.eql(u8, &existing.id, &item.id)) {
                // Structured lifecycle hooks intentionally reuse one identity
                // as they move from working to waiting/completed/failed.
                received.read = existing.read and model.severity(received.status) == .none;
                existing.* = received;
                updated = true;
                break;
            };
            if (!updated and state.attention_count < state.attention.len) {
                state.attention[state.attention_count] = received;
                state.attention_count += 1;
            }
        },
        .select_attention => |a| {
            for (state.attention[0..state.attention_count]) |*item| if (std.mem.eql(u8, &item.id, &a.attention_id)) {
                item.read = true;
                var route: model.FocusRoute = .{ .workspace_id = item.workspace_id, .repository_id = item.repository_id, .reason = .workspace };
                if (item.surface_id) |sid| {
                    if (model.surfaceLocation(&state, sid)) |loc| {
                        const surface = state.pairs[loc.pair].surfaces[loc.surface];
                        route.surface_id = sid;
                        route.reason = if (surface.lifecycle == .live) .exact_surface else .ended_predecessor;
                    } else if (item.predecessor_surface_id) |pred| {
                        if (model.surfaceLocation(&state, pred) != null) {
                            route.surface_id = pred;
                            route.reason = .ended_predecessor;
                        } else if (item.repository_id != null) route.reason = .repository;
                    } else if (item.repository_id != null) route.reason = .repository;
                } else if (item.repository_id != null) route.reason = .repository;
                if (!item.resolved) route.reason = .unresolved;
                effect = .{ .platform_focus = route };
                break;
            };
        },
        .exact_tab_visible => |a| {
            for (state.attention[0..state.attention_count]) |*item| if (item.surface_id) |sid| {
                if (std.mem.eql(u8, &sid, &a.surface_id)) item.read = true;
            };
        },
        .remove_attention => |a| {
            var write: usize = 0;
            for (state.attention[0..state.attention_count]) |item| if (!std.mem.eql(u8, &item.id, &a.attention_id)) {
                state.attention[write] = item;
                write += 1;
            };
            state.attention_count = @intCast(write);
        },
        .navigate_pair => |key| {
            if (model.pairValid(&state, key)) {
                state.selected_pair = key;
                state.last_pair = key;
            }
        },
    }
    return .{ .state = state, .effect = effect };
}

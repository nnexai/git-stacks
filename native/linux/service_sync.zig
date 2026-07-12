pub const RefreshReason = enum(u8) { periodic, invalidation, launch_conflict, replay_gap, manual_retry };
pub const RefreshRequest = struct { reason: RefreshReason, revision: u64 = 0, cursor: ?u64 = null };
pub const RefreshCompletion = struct { generation: u64, revision: u64 };

pub const Coordinator = struct {
    requested_revision: u64 = 0,
    applied_revision: u64 = 0,
    generation: u64 = 0,
    in_flight: bool = false,
    pending: ?RefreshRequest = null,
    active: ?RefreshRequest = null,
    adopted_cursor: ?u64 = null,
    staged_cursor: ?u64 = null,
    stale: bool = false,
    cancelled: bool = false,

    pub fn request(self: *Coordinator, value: RefreshRequest) bool {
        if (self.cancelled) return false;
        self.requested_revision = @max(self.requested_revision, value.revision);
        var next = value;
        if (self.pending) |prior| {
            next.revision = @max(prior.revision, value.revision);
            next.reason = if (@intFromEnum(value.reason) > @intFromEnum(prior.reason)) value.reason else prior.reason;
            next.cursor = value.cursor orelse prior.cursor;
        }
        if (next.reason == .replay_gap and next.cursor != null) self.staged_cursor = next.cursor;
        if (self.in_flight) {
            const baseline = self.pending orelse self.active.?;
            const meaningful = next.revision > baseline.revision or @intFromEnum(next.reason) > @intFromEnum(baseline.reason);
            if (meaningful) self.pending = next;
            return meaningful;
        }
        self.pending = next;
        return true;
    }
    pub fn begin(self: *Coordinator) ?RefreshCompletion {
        if (self.cancelled or self.in_flight) return null;
        const request_value = self.pending orelse return null;
        self.pending = null;
        self.active = request_value;
        self.in_flight = true;
        self.generation += 1;
        return .{ .generation = self.generation, .revision = request_value.revision };
    }
    pub fn succeed(self: *Coordinator, generation: u64, revision: u64) bool {
        if (self.cancelled or !self.in_flight or generation != self.generation) return false;
        self.in_flight = false;
        self.active = null;
        self.applied_revision = @max(self.applied_revision, revision);
        if (self.staged_cursor) |cursor| { self.adopted_cursor = cursor; self.staged_cursor = null; }
        self.stale = false;
        return true;
    }
    pub fn fail(self: *Coordinator, generation: u64, _: anyerror) bool {
        if (self.cancelled or !self.in_flight or generation != self.generation) return false;
        self.in_flight = false;
        self.active = null;
        self.stale = true;
        return true;
    }
    pub fn periodicDue(self: *Coordinator, revision: u64) bool { return self.request(.{ .reason = .periodic, .revision = revision }); }
    pub fn cancel(self: *Coordinator) void { self.cancelled = true; self.in_flight = false; self.pending = null; self.active = null; self.staged_cursor = null; }
};

const std = @import("std");
const model = @import("model");
const reducer = @import("reducer");

pub const Presentation = struct { icon: []const u8, label: [96]u8 = [_]u8{0} ** 96, label_len: u8 = 0, unread: u32, severity: model.Severity };
pub const SignalGroup = enum { needs_attention, recent_activity };
pub const RecoveryAction = enum { none, clear_filters, retry_signals, integration_health, connection_details, open_workspace, retry_dismissal };
pub const InboxMode = enum { content, loading, reconnecting, integration_degraded, load_failure, empty_attention, empty_activity, filtered_empty, focus_failure, dismiss_failure };
pub const InboxStatus = struct { title: []const u8, description: []const u8 = "", action: RecoveryAction = .none, action_label: []const u8 = "" };
pub fn inboxStatus(mode: InboxMode) InboxStatus { return switch (mode) {
    .content => .{ .title = "Signals" },
    .loading => .{ .title = "Loading signals…" },
    .reconnecting => .{ .title = "Signals are reconnecting", .description = "Existing activity is retained while git-stacks reconnects.", .action = .retry_signals, .action_label = "Retry signals" },
    .integration_degraded => .{ .title = "Some agent integrations need attention", .action = .integration_health, .action_label = "Open integration health" },
    .load_failure => .{ .title = "Signals could not be loaded", .action = .connection_details, .action_label = "Connection details" },
    .empty_attention => .{ .title = "No signals need attention", .description = "Waiting and failed agent sessions and unread notifications will appear here." },
    .empty_activity => .{ .title = "No recent activity", .description = "Agent and automation activity for this workspace will appear here." },
    .filtered_empty => .{ .title = "No signals match this filter", .action = .clear_filters, .action_label = "Clear filters" },
    .focus_failure => .{ .title = "That terminal is no longer available", .action = .open_workspace, .action_label = "Open workspace" },
    .dismiss_failure => .{ .title = "Notification could not be dismissed", .description = "The notification remains visible.", .action = .retry_dismissal, .action_label = "Retry dismissal" },
}; }
pub const SignalRow = struct {
    id: model.Id,
    workspace_id: model.Id,
    repository_id: ?model.Id,
    provider: []const u8,
    title: [160]u8 = [_]u8{0} ** 160,
    title_len: u8 = 0,
    detail: [500]u8 = [_]u8{0} ** 500,
    detail_len: u16 = 0,
    location: [256]u8 = [_]u8{0} ** 256,
    location_len: u16 = 0,
    occurred: [40]u8 = [_]u8{0} ** 40,
    occurred_len: u8 = 0,
    relative: [32]u8 = [_]u8{0} ** 32,
    relative_len: u8 = 0,
    fallback: []const u8,
    unread: bool,
    group: SignalGroup,
    lifecycle: []const u8,
    focus_label: []const u8 = "Focus terminal",
    dismissible: bool = false,
    dismiss_label: []const u8 = "Dismiss notification",
};

pub fn present(state: *const model.State, workspace: model.Id, repository: ?model.Id, surface: ?model.Id) Presentation {
    const a = model.aggregate(state, workspace, repository, surface);
    var p: Presentation = .{ .icon = if (a.severity == .primary) "dialog-warning-symbolic" else if (a.severity == .secondary) "emblem-ok-symbolic" else "media-record-symbolic", .unread = a.unread, .severity = a.severity };
    const status = switch (a.severity) { .primary => "Needs input", .secondary => "Completed", .none => "Idle" };
    const rendered = std.fmt.bufPrint(&p.label, "{d} unread · {s}", .{ a.unread, status }) catch "Signal";
    p.label_len = @intCast(rendered.len);
    return p;
}

fn workspaceName(state: *const model.State, id: model.Id) []const u8 {
    for (state.workspaces[0..state.workspace_count]) |*ws| if (std.mem.eql(u8, &ws.id, &id)) return if (ws.name_len > 0) ws.name[0..ws.name_len] else ws.id[0..8];
    return id[0..8];
}
fn repositoryName(state: *const model.State, workspace: model.Id, repository: model.Id) []const u8 {
    for (state.workspaces[0..state.workspace_count]) |*ws| if (std.mem.eql(u8, &ws.id, &workspace))
        for (ws.repositories[0..ws.repository_count]) |*repo| if (std.mem.eql(u8, &repo.id, &repository)) return if (repo.name_len > 0) repo.name[0..repo.name_len] else repo.id[0..8];
    return repository[0..8];
}
pub fn displaySurfaceTitle(surface: model.Surface) []const u8 {
    if (surface.title_len == 0) return "Terminal";
    const title = surface.title[0..surface.title_len];
    for (title) |byte| if (byte < 0x20 or byte == 0x7f) return "Terminal";
    return title;
}
fn surfaceTitle(state: *const model.State, id: model.Id) ?[]const u8 {
    const loc = model.surfaceLocation(state, id) orelse return null;
    return displaySurfaceTitle(state.pairs[loc.pair].surfaces[loc.surface]);
}
fn digits(value: []const u8) ?i64 { var n: i64 = 0; for (value) |ch| { if (ch < '0' or ch > '9') return null; n = n * 10 + ch - '0'; } return n; }
fn signalEpoch(value: []const u8) ?i64 { if (value.len < 19 or value[4] != '-' or value[7] != '-' or value[10] != 'T') return null; const y = digits(value[0..4]) orelse return null; const m = digits(value[5..7]) orelse return null; const d = digits(value[8..10]) orelse return null; const hh = digits(value[11..13]) orelse return null; const mm = digits(value[14..16]) orelse return null; const ss = digits(value[17..19]) orelse return null; const adjusted = y - @intFromBool(m <= 2); const era = @divFloor(adjusted, 400); const yoe = adjusted - era * 400; const mp = m + (if (m > 2) @as(i64, -3) else 9); const doy = @divFloor(153 * mp + 2, 5) + d - 1; const doe = yoe * 365 + @divFloor(yoe, 4) - @divFloor(yoe, 100) + doy; const days = era * 146097 + doe - 719468; return days * 86400 + hh * 3600 + mm * 60 + ss; }
fn setRelative(row: *SignalRow, occurred: []const u8, now: i64) void { const then = signalEpoch(occurred) orelse return; const delta = @max(@as(i64, 0), now - then); const rendered = if (delta < 60) std.fmt.bufPrint(&row.relative, "now", .{}) catch return else if (delta < 3600) std.fmt.bufPrint(&row.relative, "{d}m ago", .{@divFloor(delta, 60)}) catch return else if (delta < 86400) std.fmt.bufPrint(&row.relative, "{d}h ago", .{@divFloor(delta, 3600)}) catch return else std.fmt.bufPrint(&row.relative, "{d}d ago", .{@divFloor(delta, 86400)}) catch return; row.relative_len = @intCast(rendered.len); }
pub fn projectAt(state: *const model.State, item: model.Signal, now: i64) SignalRow {
    const needs_attention = (item.kind == .notification and !item.read) or (item.kind == .activity and (item.status == .waiting or item.status == .failed));
    var row: SignalRow = .{ .id = item.id, .workspace_id = item.workspace_id, .repository_id = item.repository_id, .provider = switch (item.provider) { .claude => "Claude", .copilot => "GitHub Copilot", .codex => "Codex", .opencode => "OpenCode", .automation => "Automation", .acp => "ACP", .user => "User", .other => "Other" }, .fallback = "Exact terminal", .unread = item.kind == .notification and !item.read, .group = if (needs_attention) .needs_attention else .recent_activity, .lifecycle = switch (item.status) { .waiting => "Needs input", .failed => "Failed", .completed => "Completed", .working => "Working", .idle => "Idle" }, .dismissible = item.kind == .notification and !item.read };
    const title = if (item.title_len > 0) item.title[0..item.title_len] else @tagName(item.status);
    @memcpy(row.title[0..title.len], title); row.title_len = @intCast(title.len);
    @memcpy(row.detail[0..item.detail_len], item.detail[0..item.detail_len]); row.detail_len = item.detail_len;
    @memcpy(row.occurred[0..item.occurred_at_len], item.occurred_at[0..item.occurred_at_len]); row.occurred_len = item.occurred_at_len;
    setRelative(&row, item.occurred_at[0..item.occurred_at_len], now);
    const ws = workspaceName(state, item.workspace_id);
    const rendered = if (item.repository_id) |rid| if (item.surface_id) |sid|
        if (surfaceTitle(state, sid)) |terminal| std.fmt.bufPrint(&row.location, "{s} / {s} / {s}", .{ ws, repositoryName(state, item.workspace_id, rid), terminal }) catch ws
        else std.fmt.bufPrint(&row.location, "{s} / {s}", .{ ws, repositoryName(state, item.workspace_id, rid) }) catch ws
    else std.fmt.bufPrint(&row.location, "{s} / {s}", .{ ws, repositoryName(state, item.workspace_id, rid) }) catch ws else blk: { @memcpy(row.location[0..ws.len], ws); break :blk row.location[0..ws.len]; };
    row.location_len = @intCast(rendered.len);
    if (item.surface_id != null and surfaceTitle(state, item.surface_id.?) == null) row.fallback = if (item.predecessor_surface_id != null) "Terminal ended; opens its nearest surviving context" else "Terminal unavailable; opens its repository" else if (item.repository_id != null) row.fallback = "Repository context" else row.fallback = "Workspace context";
    if (!item.resolved) row.fallback = "Context is no longer available";
    return row;
}
pub fn project(state: *const model.State, item: model.Signal) SignalRow { return projectAt(state, item, std.time.timestamp()); }

pub fn activate(state: model.State, id: model.Id) reducer.Result { return reducer.reduce(state, .{ .focus_signal = .{ .signal_key = id } }); }
pub fn asynchronous(state: model.State, item: model.Signal) reducer.Result { const result = reducer.reduce(state, .{ .signal_received = item }); std.debug.assert(result.effect == .none); return result; }
pub fn collect(state: *const model.State, group: SignalGroup, scope: ?model.PairKey, out: []SignalRow) usize { var count: usize = 0; for (state.signals[0..state.signal_count]) |item| { if (scope) |key| if (!std.mem.eql(u8, &item.workspace_id, &key.workspace_id) or (item.repository_id != null and !std.mem.eql(u8, &item.repository_id.?, &key.repository_id))) continue; const row = project(state, item); if (row.group != group or count == out.len) continue; out[count] = row; count += 1; } return count; }

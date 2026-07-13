const std = @import("std");
const model = @import("model");
const reducer = @import("reducer");

pub const Presentation = struct { icon: []const u8, label: [96]u8 = [_]u8{0} ** 96, label_len: u8 = 0, unread: u32, severity: model.Severity };
pub const AttentionRow = struct {
    id: model.Id,
    provider: []const u8,
    title: [160]u8 = [_]u8{0} ** 160,
    title_len: u8 = 0,
    detail: [500]u8 = [_]u8{0} ** 500,
    detail_len: u16 = 0,
    location: [256]u8 = [_]u8{0} ** 256,
    location_len: u16 = 0,
    occurred: [40]u8 = [_]u8{0} ** 40,
    occurred_len: u8 = 0,
    fallback: []const u8,
    unread: bool,
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
fn surfaceTitle(state: *const model.State, id: model.Id) ?[]const u8 {
    const loc = model.surfaceLocation(state, id) orelse return null;
    const surface = state.pairs[loc.pair].surfaces[loc.surface];
    return if (surface.title_len > 0) surface.title[0..surface.title_len] else "Terminal";
}
pub fn project(state: *const model.State, item: model.Signal) AttentionRow {
    var row: AttentionRow = .{ .id = item.id, .provider = switch (item.provider) { .claude => "Claude", .copilot => "GitHub Copilot", .codex => "Codex", .opencode => "OpenCode", .automation => "Automation", .acp => "ACP", .user => "User", .other => "Other" }, .fallback = "Exact terminal", .unread = !item.read and model.severity(item.status) != .none };
    const title = if (item.title_len > 0) item.title[0..item.title_len] else @tagName(item.status);
    @memcpy(row.title[0..title.len], title); row.title_len = @intCast(title.len);
    @memcpy(row.detail[0..item.detail_len], item.detail[0..item.detail_len]); row.detail_len = item.detail_len;
    @memcpy(row.occurred[0..item.occurred_at_len], item.occurred_at[0..item.occurred_at_len]); row.occurred_len = item.occurred_at_len;
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

pub fn activate(state: model.State, id: model.Id) reducer.Result { return reducer.reduce(state, .{ .select_attention = .{ .attention_id = id } }); }
pub fn asynchronous(state: model.State, item: model.Signal) reducer.Result { const result = reducer.reduce(state, .{ .signal_received = item }); std.debug.assert(result.effect == .none); return result; }

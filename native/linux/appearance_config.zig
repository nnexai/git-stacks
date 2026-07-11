const std = @import("std");

pub const Appearance = struct {
    allocator: std.mem.Allocator,
    font_families: std.ArrayList([:0]u8) = .empty,
    pango_families: [:0]u8,
    font_size: f32 = 12,
    diagnostics: usize = 0,
    source: ?[]u8 = null,

    pub fn init(allocator: std.mem.Allocator) !Appearance {
        var result = Appearance{ .allocator = allocator, .pango_families = try allocator.dupeZ(u8, "Monospace") };
        errdefer allocator.free(result.pango_families);
        try result.font_families.append(allocator, try allocator.dupeZ(u8, "Monospace"));
        return result;
    }
    pub fn deinit(self: *Appearance) void { for (self.font_families.items) |item| self.allocator.free(item); self.font_families.deinit(self.allocator); self.allocator.free(self.pango_families); if (self.source) |path| self.allocator.free(path); }
    pub fn primaryFamily(self: *const Appearance) [:0]const u8 { return self.pango_families; }
    fn refreshFamilyList(self: *Appearance) !void { var total: usize = 0; for (self.font_families.items, 0..) |item, i| total += item.len + @as(usize, if (i == 0) 0 else 2); const buf = try self.allocator.alloc(u8, total + 1); var offset: usize = 0; for (self.font_families.items, 0..) |item, i| { if (i != 0) { @memcpy(buf[offset..][0..2], ", "); offset += 2; } @memcpy(buf[offset..][0..item.len], item); offset += item.len; } buf[total] = 0; self.allocator.free(self.pango_families); self.pango_families = buf[0..total :0]; }
};

pub fn parseText(allocator: std.mem.Allocator, text: []const u8) !Appearance {
    var result = try Appearance.init(allocator); errdefer result.deinit();
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trim(u8, raw, &std.ascii.whitespace);
        if (line.len == 0 or line[0] == '#' or line.len > 4096) { if (line.len > 4096) result.diagnostics += 1; continue; }
        const equals = std.mem.indexOfScalar(u8, line, '=') orelse continue;
        const key = std.mem.trim(u8, line[0..equals], " \t");
        var value = std.mem.trim(u8, line[equals + 1 ..], " \t\r");
        if (value.len >= 2 and value[0] == '"' and value[value.len - 1] == '"') value = value[1 .. value.len - 1];
        if (std.mem.eql(u8, key, "font-family")) {
            if (value.len == 0) { for (result.font_families.items) |item| allocator.free(item); result.font_families.clearRetainingCapacity(); continue; }
            if (value.len > 256 or std.mem.indexOfScalar(u8, value, 0) != null) { result.diagnostics += 1; continue; }
            var valid = true; for (value) |byte| if (byte < 0x20 or byte == 0x7f) { valid = false; break; }; if (!valid) { result.diagnostics += 1; continue; }
            if (result.font_families.items.len == 1 and std.mem.eql(u8, result.font_families.items[0], "Monospace")) { allocator.free(result.font_families.items[0]); result.font_families.clearRetainingCapacity(); }
            if (result.font_families.items.len < 16) try result.font_families.append(allocator, try allocator.dupeZ(u8, value)) else result.diagnostics += 1;
        } else if (std.mem.eql(u8, key, "font-size")) {
            const parsed = std.fmt.parseFloat(f32, value) catch { result.diagnostics += 1; continue; };
            if (!std.math.isFinite(parsed) or parsed < 6 or parsed > 72) { result.diagnostics += 1; continue; }
            result.font_size = parsed;
        } else if (std.mem.eql(u8, key, "config-file")) result.diagnostics += 1;
    }
    if (result.font_families.items.len == 0) try result.font_families.append(allocator, try allocator.dupeZ(u8, "Monospace"));
    try result.refreshFamilyList();
    return result;
}

pub fn discoverPathAt(allocator: std.mem.Allocator, base: []const u8) ![]u8 {
    const current = try std.fs.path.join(allocator, &.{ base, "ghostty", "config.ghostty" });
    if (std.fs.cwd().access(current, .{})) |_| return current else |_| allocator.free(current);
    return std.fs.path.join(allocator, &.{ base, "ghostty", "config" });
}
pub fn discoverPath(allocator: std.mem.Allocator) ![]u8 {
    const base = if (std.posix.getenv("XDG_CONFIG_HOME")) |xdg| try allocator.dupe(u8, xdg) else blk: {
        const home = std.posix.getenv("HOME") orelse return error.HomeUnavailable;
        break :blk try std.fs.path.join(allocator, &.{ home, ".config" });
    };
    defer allocator.free(base);
    return discoverPathAt(allocator, base);
}

pub fn load(allocator: std.mem.Allocator) !Appearance {
    const base = if (std.posix.getenv("XDG_CONFIG_HOME")) |xdg| try allocator.dupe(u8, xdg) else blk: { const home = std.posix.getenv("HOME") orelse return Appearance.init(allocator); break :blk try std.fs.path.join(allocator, &.{ home, ".config" }); };
    defer allocator.free(base); return loadAt(allocator, base);
}
pub fn loadAt(allocator: std.mem.Allocator, base: []const u8) !Appearance {
    const legacy = try std.fs.path.join(allocator, &.{ base, "ghostty", "config" }); defer allocator.free(legacy);
    const current = try std.fs.path.join(allocator, &.{ base, "ghostty", "config.ghostty" }); defer allocator.free(current);
    var combined: std.ArrayList(u8) = .empty; defer combined.deinit(allocator); var source: ?[]const u8 = null;
    const paths = [_][]const u8{ legacy, current }; for (paths) |path| {
        const file = std.fs.cwd().openFile(path, .{}) catch continue; defer file.close();
        const text = file.readToEndAlloc(allocator, 1024 * 1024) catch continue; defer allocator.free(text);
        try combined.appendSlice(allocator, text); try combined.append(allocator, '\n'); source = path;
    }
    var result = try parseText(allocator, combined.items); if (source) |path| result.source = try allocator.dupe(u8, path); return result;
}

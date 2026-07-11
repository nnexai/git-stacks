const std = @import("std"); const config = @import("appearance_config");
test "absent configuration uses safe Linux defaults" { var got = try config.parseText(std.testing.allocator, ""); defer got.deinit(); try std.testing.expectEqualStrings("Monospace", got.primaryFamily()); try std.testing.expectEqual(@as(f32, 12), got.font_size); }
test "comments whitespace quotes repeats reset override and invalid bounds" {
    var got = try config.parseText(std.testing.allocator,
        "# comment\n font-family = First Mono \nfont-family = \"Fallback Mono\"\nfont-family = \"\"\nfont-family = Final Mono\nfont-size = nope\nfont-size = 200\nfont-size = 14.5\nconfig-file = ../outside\n"); defer got.deinit();
    try std.testing.expectEqual(@as(usize, 1), got.font_families.items.len); try std.testing.expectEqualStrings("Final Mono", got.primaryFamily()); try std.testing.expectEqual(@as(f32, 14.5), got.font_size); try std.testing.expectEqual(@as(usize, 3), got.diagnostics);
}
test "repeated font families become ordered Pango fallbacks" { var got = try config.parseText(std.testing.allocator, "font-family = First Mono\nfont-family = Fallback Mono\n"); defer got.deinit(); try std.testing.expectEqualStrings("First Mono, Fallback Mono", got.primaryFamily()); }
test "standard discovery prefers config.ghostty and falls back to legacy config" {
    var tmp = std.testing.tmpDir(.{}); defer tmp.cleanup();
    try tmp.dir.makePath("ghostty");
    const base = try tmp.dir.realpathAlloc(std.testing.allocator, "."); defer std.testing.allocator.free(base);
    const legacy = try config.discoverPathAt(std.testing.allocator, base); defer std.testing.allocator.free(legacy); try std.testing.expect(std.mem.endsWith(u8, legacy, "ghostty/config"));
    var file = try tmp.dir.createFile("ghostty/config.ghostty", .{}); file.close();
    const current = try config.discoverPathAt(std.testing.allocator, base); defer std.testing.allocator.free(current); try std.testing.expect(std.mem.endsWith(u8, current, "ghostty/config.ghostty"));
}
test "legacy loads first and config.ghostty overrides it" { var tmp = std.testing.tmpDir(.{}); defer tmp.cleanup(); try tmp.dir.makePath("ghostty"); { var f = try tmp.dir.createFile("ghostty/config", .{}); defer f.close(); try f.writeAll("font-family = Legacy\nfont-size = 11\n"); } { var f = try tmp.dir.createFile("ghostty/config.ghostty", .{}); defer f.close(); try f.writeAll("font-family = \"\"\nfont-family = Current\nfont-size = 16\n"); } const base = try tmp.dir.realpathAlloc(std.testing.allocator, "."); defer std.testing.allocator.free(base); var got = try config.loadAt(std.testing.allocator, base); defer got.deinit(); try std.testing.expectEqualStrings("Current", got.primaryFamily()); try std.testing.expectEqual(@as(f32, 16), got.font_size); }

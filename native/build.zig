const std = @import("std");

pub fn build(b: *std.Build) void {
    const source = b.option([]const u8, "ghostty-source", "Path to the pinned Ghostty checkout") orelse
        @panic("-Dghostty-source is required; run through scripts/verify-native.ts");

    const generated = b.addWriteFiles();
    const smoke_source = generated.add("ghostty_api_smoke.zig",
        \\const ghostty = @cImport({ @cInclude("ghostty.h"); });
        \\
        \\comptime {
        \\        _ = @TypeOf(ghostty.ghostty_surface_new);
        \\        _ = @TypeOf(ghostty.ghostty_surface_free);
        \\        _ = @TypeOf(ghostty.ghostty_surface_draw);
        \\        _ = @TypeOf(ghostty.ghostty_surface_set_focus);
        \\        _ = @TypeOf(ghostty.ghostty_surface_set_size);
        \\        _ = @TypeOf(ghostty.ghostty_surface_set_content_scale);
        \\        _ = @TypeOf(ghostty.ghostty_surface_size);
        \\        _ = @TypeOf(ghostty.ghostty_surface_key);
        \\        _ = @TypeOf(ghostty.ghostty_surface_text);
        \\        _ = @TypeOf(ghostty.ghostty_surface_preedit);
        \\        _ = @TypeOf(ghostty.ghostty_surface_mouse_button);
        \\        _ = @TypeOf(ghostty.ghostty_surface_mouse_pos);
        \\        _ = @TypeOf(ghostty.ghostty_surface_mouse_scroll);
        \\        _ = @TypeOf(ghostty.ghostty_surface_ime_point);
        \\        _ = @TypeOf(ghostty.ghostty_surface_complete_clipboard_request);
        \\        _ = @TypeOf(ghostty.ghostty_runtime_read_clipboard_cb);
        \\        _ = @TypeOf(ghostty.ghostty_runtime_write_clipboard_cb);
        \\        _ = @TypeOf(ghostty.ghostty_surface_message_childexited_s);
        \\        _ = @TypeOf(ghostty.ghostty_surface_process_exited);
        \\        _ = @TypeOf(ghostty.ghostty_surface_needs_confirm_quit);
        \\        _ = @TypeOf(ghostty.ghostty_surface_request_close);
        \\}
    );

    const smoke = b.addObject(.{ .name = "ghostty-api-smoke", .root_module = b.createModule(.{
        .root_source_file = smoke_source,
        .target = b.graph.host,
        .optimize = .Debug,
    }) });
    smoke.root_module.link_libc = true;
    smoke.root_module.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ source, "include" }) });

    const step = b.step("terminal-api-smoke", "Compile and test the pinned full libghostty C surface API");
    step.dependOn(&smoke.step);
}

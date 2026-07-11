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

    const model = b.addLibrary(.{
        .name = "git_stacks_native_v1",
        .linkage = .static,
        .root_module = b.createModule(.{
            .root_source_file = b.path("core/abi.zig"),
            .target = b.graph.host,
            .optimize = .Debug,
        }),
    });
    model.linkLibC();

    const model_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("core/contract.zig"),
            .target = b.graph.host,
            .optimize = .Debug,
        }),
    });
    const run_model_tests = b.addRunArtifact(model_tests);

    const reducer_test_module = b.createModule(.{
        .root_source_file = b.path("tests/reducer_test.zig"), .target = b.graph.host, .optimize = .Debug,
    });
    reducer_test_module.addImport("reducer", b.createModule(.{ .root_source_file = b.path("core/reducer.zig") }));
    const reducer_tests = b.addTest(.{ .root_module = reducer_test_module });
    const run_reducer_tests = b.addRunArtifact(reducer_tests);

    const persistence_test_module = b.createModule(.{
        .root_source_file = b.path("tests/persistence_test.zig"), .target = b.graph.host, .optimize = .Debug,
    });
    persistence_test_module.addImport("persistence", b.createModule(.{ .root_source_file = b.path("core/persistence.zig") }));
    const persistence_tests = b.addTest(.{ .root_module = persistence_test_module });
    const run_persistence_tests = b.addRunArtifact(persistence_tests);

    const restore_step = b.step("restore-test", "Run presentation restoration and quarantine tests");
    restore_step.dependOn(&run_persistence_tests.step);

    const ownership_test_module = b.createModule(.{
        .root_source_file = b.path("tests/ownership_test.zig"), .target = b.graph.host, .optimize = .Debug,
    });
    ownership_test_module.addImport("ownership", b.createModule(.{ .root_source_file = b.path("terminal/ownership.zig") }));
    ownership_test_module.addImport("guard", b.createModule(.{ .root_source_file = b.path("terminal/guard.zig") }));
    ownership_test_module.addImport("diagnostics", b.createModule(.{ .root_source_file = b.path("terminal/diagnostics.zig") }));
    const ownership_tests = b.addTest(.{ .root_module = ownership_test_module });
    const run_ownership_tests = b.addRunArtifact(ownership_tests);
    const lifecycle_step = b.step("lifecycle-test", "Run terminal ownership and guard lifecycle tests");
    lifecycle_step.dependOn(&run_ownership_tests.step);

    const harness = b.addExecutable(.{
        .name = "abi-harness",
        .root_module = b.createModule(.{
            .target = b.graph.host,
            .optimize = .Debug,
        }),
    });
    harness.root_module.addCSourceFile(.{ .file = b.path("tests/abi_harness.c"), .flags = &.{ "-std=c11", "-Wall", "-Wextra", "-Werror" } });
    harness.root_module.addIncludePath(b.path("include"));
    harness.linkLibrary(model);
    harness.linkLibC();
    const run_harness = b.addRunArtifact(harness);

    const model_step = b.step("model-test", "Run native model and public ABI tests");
    model_step.dependOn(&run_model_tests.step);
    model_step.dependOn(&run_reducer_tests.step);
    model_step.dependOn(&run_harness.step);
}

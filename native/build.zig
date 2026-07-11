const std = @import("std");

pub fn build(b: *std.Build) void {
    const source = b.option([]const u8, "ghostty-source", "Path to the pinned Ghostty checkout") orelse
        @panic("-Dghostty-source is required; run through scripts/verify-native.ts");

    const ghostty_vt = b.createModule(.{ .root_source_file = .{ .cwd_relative = b.pathJoin(&.{ source, "src/lib_vt.zig" }) }, .target = b.graph.host, .optimize = .Debug });
    const terminal_options = b.addOptions();
    terminal_options.addOption(enum { ghostty, lib }, "artifact", .lib);
    terminal_options.addOption(bool, "c_abi", false);
    terminal_options.addOption(bool, "oniguruma", false);
    terminal_options.addOption(bool, "simd", false);
    terminal_options.addOption(bool, "slow_runtime_safety", true);
    terminal_options.addOption(bool, "kitty_graphics", false);
    terminal_options.addOption(bool, "tmux_control_mode", false);
    ghostty_vt.addOptions("terminal_options", terminal_options);
    const uucode_config: std.Build.LazyPath = .{ .cwd_relative = b.pathJoin(&.{ source, "src/build/uucode_config.zig" }) };
    const uucode_tables_dep = b.dependency("uucode", .{ .build_config_path = uucode_config });
    const uucode = b.dependency("uucode", .{ .target = b.graph.host, .optimize = .Debug, .tables_path = uucode_tables_dep.namedLazyPath("tables.zig"), .build_config_path = uucode_config });
    ghostty_vt.addImport("uucode", uucode.module("uucode"));
    const props_gen = b.addExecutable(.{ .name = "ghostty-props-unigen", .root_module = b.createModule(.{ .root_source_file = .{ .cwd_relative = b.pathJoin(&.{ source, "src/unicode/props_uucode.zig" }) }, .target = b.graph.host, .strip = false, .omit_frame_pointer = false, .unwind_tables = .sync }), .use_llvm = true });
    props_gen.root_module.addImport("uucode", uucode.module("uucode"));
    const props_run = b.addRunArtifact(props_gen);
    const generated_unicode = b.addWriteFiles();
    const props_output = generated_unicode.addCopyFile(props_run.captureStdOut(), "ghostty-props.zig");
    ghostty_vt.addAnonymousImport("unicode_tables", .{ .root_source_file = props_output });
    const vt_adapter = b.createModule(.{ .root_source_file = b.path("terminal/vt_adapter.zig") });
    vt_adapter.addImport("ghostty_vt", ghostty_vt);
    const vt_test_module = b.createModule(.{ .root_source_file = b.path("tests/vt_adapter_test.zig"), .target = b.graph.host, .optimize = .Debug });
    vt_test_module.addImport("vt_adapter", vt_adapter);
    const vt_tests = b.addTest(.{ .root_module = vt_test_module });
    vt_tests.linkLibC();
    const run_vt_tests = b.addRunArtifact(vt_tests);
    const vt_step = b.step("vt-test", "Run exact-pin ghostty-vt adapter tests");
    vt_step.dependOn(&run_vt_tests.step);
    const pty_module = b.createModule(.{ .root_source_file = b.path("terminal/pty.zig") });
    const pty_test_module = b.createModule(.{ .root_source_file = b.path("tests/pty_test.zig"), .target = b.graph.host, .optimize = .Debug });
    pty_test_module.addImport("pty", pty_module);
    const pty_tests = b.addTest(.{ .root_module = pty_test_module }); pty_tests.linkLibC(); pty_tests.linkSystemLibrary("util");
    const run_pty_tests = b.addRunArtifact(pty_tests); const pty_step = b.step("pty-test", "Run real PTY tests"); pty_step.dependOn(&run_pty_tests.step);
    const runtime_module = b.createModule(.{ .root_source_file = b.path("terminal/runtime.zig") }); runtime_module.addImport("pty", pty_module); runtime_module.addImport("vt_adapter", vt_adapter);
    const runtime_test_module = b.createModule(.{ .root_source_file = b.path("tests/terminal_runtime_test.zig"), .target = b.graph.host, .optimize = .Debug }); runtime_test_module.addImport("runtime", runtime_module);
    const runtime_tests = b.addTest(.{ .root_module = runtime_test_module }); runtime_tests.linkLibC(); runtime_tests.linkSystemLibrary("util");
    const run_runtime_tests = b.addRunArtifact(runtime_tests); const runtime_step = b.step("runtime-test", "Run PTY VT runtime integration"); runtime_step.dependOn(&run_runtime_tests.step);
    const input_module = b.createModule(.{ .root_source_file = b.path("linux/input.zig") }); input_module.addImport("runtime", runtime_module); input_module.addImport("vt_adapter", vt_adapter);
    const ghostty_config_module = b.createModule(.{ .root_source_file = b.path("linux/ghostty_config.zig") });
    const config_test_module = b.createModule(.{ .root_source_file = b.path("tests/ghostty_config_test.zig"), .target = b.graph.host, .optimize = .Debug }); config_test_module.addImport("ghostty_config", ghostty_config_module);
    const config_tests = b.addTest(.{ .root_module = config_test_module }); const run_config_tests = b.addRunArtifact(config_tests); const config_step = b.step("config-test", "Verify Ghostty appearance config compatibility"); config_step.dependOn(&run_config_tests.step);
    inline for (.{ .{ "input-test", "tests/input_test.zig" }, .{ "interaction-test", "tests/interaction_test.zig" } }) |spec| { const m = b.createModule(.{ .root_source_file = b.path(spec[1]), .target = b.graph.host, .optimize = .Debug }); m.addImport("runtime", runtime_module); m.addImport("input", input_module); const t = b.addTest(.{ .root_module = m }); t.linkLibC(); t.linkSystemLibrary("util"); const run = b.addRunArtifact(t); const step = b.step(spec[0], spec[0]); step.dependOn(&run.step); }

    const renderer_module = b.createModule(.{ .root_source_file = b.path("linux/renderer.zig") });
    renderer_module.addImport("vt_adapter", vt_adapter);
    addGtkIncludes(renderer_module);
    const widget_module = b.createModule(.{ .root_source_file = b.path("linux/terminal_widget.zig") });
    widget_module.addImport("vt_adapter", vt_adapter);
    widget_module.addImport("renderer", renderer_module);
    addGtkIncludes(widget_module);
    const renderer_test_module = b.createModule(.{ .root_source_file = b.path("tests/renderer_test.zig"), .target = b.graph.host, .optimize = .Debug });
    renderer_test_module.addImport("vt_adapter", vt_adapter);
    renderer_test_module.addImport("renderer", renderer_module);
    addGtkIncludes(renderer_test_module);
    const renderer_tests = b.addTest(.{ .root_module = renderer_test_module });
    linkGtk(renderer_tests);
    const run_renderer_tests = b.addRunArtifact(renderer_tests);
    const renderer_step = b.step("renderer-test", "Run GTK snapshot renderer tests");
    renderer_step.dependOn(&run_renderer_tests.step);

    const widget_test_module = b.createModule(.{ .root_source_file = b.path("tests/terminal_widget_test.zig"), .target = b.graph.host, .optimize = .Debug });
    widget_test_module.addImport("vt_adapter", vt_adapter);
    widget_test_module.addImport("terminal_widget", widget_module);
    addGtkIncludes(widget_test_module);
    const widget_tests = b.addTest(.{ .root_module = widget_test_module });
    linkGtk(widget_tests);
    const run_widget_tests = b.addRunArtifact(widget_tests);
    const widget_step = b.step("widget-test", "Run production GTK widget lifecycle tests");
    widget_step.dependOn(&run_widget_tests.step);
    const accessibility_test_module = b.createModule(.{ .root_source_file = b.path("tests/accessibility_test.zig"), .target = b.graph.host, .optimize = .Debug }); accessibility_test_module.addImport("terminal_widget", widget_module);
    const accessibility_tests = b.addTest(.{ .root_module = accessibility_test_module }); linkGtk(accessibility_tests); const run_accessibility_tests = b.addRunArtifact(accessibility_tests); const accessibility_step = b.step("accessibility-test", "Verify honest GTK accessibility declarations"); accessibility_step.dependOn(&run_accessibility_tests.step);

    const app_module = b.createModule(.{ .root_source_file = b.path("linux/app.zig"), .target = b.graph.host, .optimize = .Debug });
    app_module.addImport("vt_adapter", vt_adapter);
    app_module.addImport("terminal_widget", widget_module);
    app_module.addImport("runtime", runtime_module);
    app_module.addImport("input", input_module);
    app_module.addImport("ghostty_config", ghostty_config_module);
    addGtkIncludes(app_module);
    const app = b.addExecutable(.{ .name = "git-stacks-native", .root_module = app_module });
    linkGtk(app); app.linkSystemLibrary("util");
    b.installArtifact(app);
    const app_step = b.step("build-app", "Build and install the production GTK application");
    app_step.dependOn(b.getInstallStep());
    const run_app = b.addRunArtifact(app);
    const run_app_step = b.step("run-app", "Run the production GTK application");
    run_app_step.dependOn(&run_app.step);

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
    ownership_tests.linkLibC();
    const run_ownership_tests = b.addRunArtifact(ownership_tests);
    const lifecycle_step = b.step("lifecycle-test", "Run terminal ownership and guard lifecycle tests");
    lifecycle_step.dependOn(&run_ownership_tests.step);

    const stress_test_module = b.createModule(.{
        .root_source_file = b.path("tests/lifecycle_stress.zig"), .target = b.graph.host, .optimize = .Debug,
    });
    stress_test_module.addImport("runtime", runtime_module);
    const stress_tests = b.addTest(.{ .root_module = stress_test_module });
    stress_tests.linkLibC();
    stress_tests.linkSystemLibrary("util");
    const run_stress_tests = b.addRunArtifact(stress_tests);
    const stress_step = b.step("lifecycle-stress", "Run bounded terminal lifecycle resource stress");
    stress_step.dependOn(&run_stress_tests.step);

    const host_step = b.step("terminal-host-test", "Run terminal host lifecycle and input tests");
    host_step.dependOn(&run_widget_tests.step);

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

fn addGtkIncludes(module: *std.Build.Module) void {
    inline for (.{ "/usr/include/gtk-4.0", "/usr/include/pango-1.0", "/usr/include/glib-2.0", "/usr/lib64/glib-2.0/include", "/usr/include/harfbuzz", "/usr/include/cairo", "/usr/include/graphene-1.0", "/usr/lib64/graphene-1.0/include", "/usr/include/gdk-pixbuf-2.0", "/usr/include/gio-unix-2.0", "/usr/include/freetype2", "/usr/include/libpng16", "/usr/include/pixman-1", "/usr/include/fribidi" }) |path| module.addSystemIncludePath(.{ .cwd_relative = path });
}

fn linkGtk(artifact: *std.Build.Step.Compile) void {
    artifact.linkLibC();
    inline for (.{ "gtk-4", "gdk_pixbuf-2.0", "graphene-1.0", "pangocairo-1.0", "pango-1.0", "cairo-gobject", "cairo", "gio-2.0", "gobject-2.0", "glib-2.0" }) |lib| artifact.linkSystemLibrary(lib);
}

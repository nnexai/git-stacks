const std = @import("std");

pub fn build(b: *std.Build) void {
    const source = b.option([]const u8, "ghostty-source", "Path to the verified derived Ghostty checkout") orelse
        @panic("-Dghostty-source is required; run through scripts/verify-native.ts");
    const include_dir: std.Build.LazyPath = .{ .cwd_relative = b.pathJoin(&.{ source, "zig-out", "include" }) };
    const library_dir: std.Build.LazyPath = .{ .cwd_relative = b.pathJoin(&.{ source, "zig-out", "lib" }) };

    const surface_abi_module = b.createModule(.{
        .root_source_file = b.path("tests/ghostty_surface_abi.zig"),
        .target = b.graph.host,
        .optimize = .Debug,
    });
    surface_abi_module.addIncludePath(include_dir);
    surface_abi_module.addLibraryPath(library_dir);
    surface_abi_module.addRPath(library_dir);
    surface_abi_module.addCSourceFile(.{ .file = .{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "src", "gl.c" }) }, .flags = &.{} });
    surface_abi_module.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "include" }) });
    const surface_abi = b.addTest(.{ .root_module = surface_abi_module });
    surface_abi.linkLibC();
    surface_abi.linkSystemLibrary("ghostty");
    const run_surface_abi = b.addRunArtifact(surface_abi);
    const surface_abi_step = b.step("surface-abi", "Compile, link, and execute the pinned Ghostty surface ABI contract");
    surface_abi_step.dependOn(&run_surface_abi.step);

    const app_module = b.createModule(.{
        .root_source_file = b.path("linux/app.zig"),
        .target = b.graph.host,
        .optimize = .ReleaseSafe,
    });
    app_module.addIncludePath(include_dir);
    app_module.addLibraryPath(library_dir);
    app_module.addRPath(library_dir);
    app_module.addCSourceFile(.{ .file = .{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "src", "gl.c" }) }, .flags = &.{} });
    app_module.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "include" }) });
    const clipboard_module = b.createModule(.{ .root_source_file = b.path("linux/ghostty_clipboard.zig"), .target = b.graph.host, .optimize = .ReleaseSafe });
    clipboard_module.addIncludePath(include_dir);
    clipboard_module.linkSystemLibrary("gtk4", .{ .use_pkg_config = .force });
    const input_module = b.createModule(.{ .root_source_file = b.path("linux/ghostty_input.zig"), .target = b.graph.host, .optimize = .ReleaseSafe });
    input_module.addImport("ghostty_clipboard", clipboard_module);
    input_module.addIncludePath(include_dir);
    input_module.linkSystemLibrary("gtk4", .{ .use_pkg_config = .force });
    const runtime_module = b.createModule(.{ .root_source_file = b.path("linux/ghostty_runtime.zig"), .target = b.graph.host, .optimize = .ReleaseSafe });
    runtime_module.addImport("ghostty_clipboard", clipboard_module);
    runtime_module.addIncludePath(include_dir);
    runtime_module.addLibraryPath(library_dir);
    runtime_module.addRPath(library_dir);
    runtime_module.linkSystemLibrary("gtk4", .{ .use_pkg_config = .force });
    const surface_module = b.createModule(.{ .root_source_file = b.path("linux/ghostty_surface.zig"), .target = b.graph.host, .optimize = .ReleaseSafe });
    surface_module.addImport("ghostty_runtime", runtime_module);
    surface_module.addImport("ghostty_clipboard", clipboard_module);
    surface_module.addImport("ghostty_input", input_module);
    const app_guard_module = b.createModule(.{ .root_source_file = b.path("terminal/guard.zig") });
    const app_reducer_module = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    const app_process_module = b.createModule(.{ .root_source_file = b.path("terminal/ghostty_process_control.zig") });
    app_process_module.addImport("guard", app_guard_module);
    app_process_module.addImport("reducer", app_reducer_module);
    app_process_module.addIncludePath(include_dir);
    surface_module.addImport("ghostty_process_control", app_process_module);
    surface_module.addImport("guard", app_guard_module);
    surface_module.addIncludePath(include_dir);
    surface_module.linkSystemLibrary("gtk4", .{ .use_pkg_config = .force });
    app_module.addImport("ghostty_runtime", runtime_module);
    app_module.addImport("ghostty_surface", surface_module);
    app_module.addImport("ghostty_clipboard", clipboard_module);
    app_module.addImport("guard", app_guard_module);
    const app = b.addExecutable(.{ .name = "git-stacks-native", .root_module = app_module });
    app.linkLibC();
    app.linkSystemLibrary("ghostty");
    app.linkSystemLibrary("gtk4");
    b.installArtifact(app);
    const app_step = b.step("build-app", "Build the full-libghostty-linked native executable");
    app_step.dependOn(b.getInstallStep());

    const surface_test_module = b.createModule(.{ .root_source_file = b.path("tests/ghostty_surface_test.zig"), .target = b.graph.host, .optimize = .Debug });
    surface_test_module.addImport("ghostty_runtime", runtime_module);
    surface_test_module.addIncludePath(include_dir);
    surface_test_module.addLibraryPath(library_dir);
    surface_test_module.addRPath(library_dir);
    const surface_tests = b.addTest(.{ .root_module = surface_test_module });
    surface_tests.linkLibC();
    surface_tests.linkSystemLibrary("ghostty");
    surface_tests.linkSystemLibrary("gtk4");
    const surface_step = b.step("surface-test", "Run embedded Ghostty runtime and surface lifecycle tests");
    surface_step.dependOn(&b.addRunArtifact(surface_tests).step);

    const interaction_test_module = b.createModule(.{ .root_source_file = b.path("tests/ghostty_interaction_test.zig"), .target = b.graph.host, .optimize = .Debug });
    interaction_test_module.addImport("ghostty_clipboard", clipboard_module);
    interaction_test_module.addIncludePath(include_dir);
    interaction_test_module.addLibraryPath(library_dir);
    interaction_test_module.addRPath(library_dir);
    const interaction_tests = b.addTest(.{ .root_module = interaction_test_module });
    interaction_tests.linkLibC();
    interaction_tests.linkSystemLibrary("ghostty");
    interaction_tests.linkSystemLibrary("gtk4");
    const interaction_step = b.step("interaction-test", "Run Ghostty interaction and generation-isolation tests");
    interaction_step.dependOn(&b.addRunArtifact(interaction_tests).step);

    const stress_tests = b.addTest(.{ .root_module = b.createModule(.{ .root_source_file = b.path("tests/lifecycle_stress.zig"), .target = b.graph.host, .optimize = .Debug }) });
    const stress_step = b.step("lifecycle-stress", "Validate production graphical stress diagnostics");
    stress_step.dependOn(&b.addRunArtifact(stress_tests).step);

    const accessibility_test_module = b.createModule(.{ .root_source_file = b.path("tests/accessibility_test.zig"), .target = b.graph.host, .optimize = .Debug });
    accessibility_test_module.addImport("ghostty_surface", surface_module);
    accessibility_test_module.addIncludePath(include_dir);
    accessibility_test_module.addCSourceFile(.{ .file = .{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "src", "gl.c" }) }, .flags = &.{} });
    accessibility_test_module.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "include" }) });
    accessibility_test_module.addLibraryPath(library_dir);
    accessibility_test_module.addRPath(library_dir);
    const accessibility_tests = b.addTest(.{ .root_module = accessibility_test_module });
    accessibility_tests.linkLibC();
    accessibility_tests.linkSystemLibrary("ghostty");
    accessibility_tests.linkSystemLibrary("gtk4");
    const accessibility_step = b.step("accessibility-test", "Inspect the production GtkGLArea accessibility contract");
    accessibility_step.dependOn(&b.addRunArtifact(accessibility_tests).step);

    const model = b.addLibrary(.{
        .name = "git_stacks_native_v1",
        .linkage = .static,
        .root_module = b.createModule(.{ .root_source_file = b.path("core/abi.zig"), .target = b.graph.host, .optimize = .Debug }),
    });
    model.linkLibC();
    const model_tests = b.addTest(.{ .root_module = b.createModule(.{ .root_source_file = b.path("core/contract.zig"), .target = b.graph.host, .optimize = .Debug }) });
    const run_model_tests = b.addRunArtifact(model_tests);
    const reducer_test_module = b.createModule(.{ .root_source_file = b.path("tests/reducer_test.zig"), .target = b.graph.host, .optimize = .Debug });
    reducer_test_module.addImport("reducer", b.createModule(.{ .root_source_file = b.path("core/reducer.zig") }));
    const run_reducer_tests = b.addRunArtifact(b.addTest(.{ .root_module = reducer_test_module }));
    const harness = b.addExecutable(.{ .name = "abi-harness", .root_module = b.createModule(.{ .target = b.graph.host, .optimize = .Debug }) });
    harness.root_module.addCSourceFile(.{ .file = b.path("tests/abi_harness.c"), .flags = &.{ "-std=c11", "-Wall", "-Wextra", "-Werror" } });
    harness.root_module.addIncludePath(b.path("include"));
    harness.linkLibrary(model);
    harness.linkLibC();
    const run_harness = b.addRunArtifact(harness);
    const model_step = b.step("model-test", "Run native model and public ABI tests");
    model_step.dependOn(&run_model_tests.step);
    model_step.dependOn(&run_reducer_tests.step);
    model_step.dependOn(&run_harness.step);

    const persistence_test_module = b.createModule(.{ .root_source_file = b.path("tests/persistence_test.zig"), .target = b.graph.host, .optimize = .Debug });
    persistence_test_module.addImport("persistence", b.createModule(.{ .root_source_file = b.path("core/persistence.zig") }));
    const restore_step = b.step("restore-test", "Run presentation restoration and quarantine tests");
    restore_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = persistence_test_module })).step);

    const ownership_test_module = b.createModule(.{ .root_source_file = b.path("tests/ownership_test.zig"), .target = b.graph.host, .optimize = .Debug });
    ownership_test_module.addImport("ownership", b.createModule(.{ .root_source_file = b.path("terminal/ownership.zig") }));
    ownership_test_module.addImport("guard", b.createModule(.{ .root_source_file = b.path("terminal/guard.zig") }));
    ownership_test_module.addImport("diagnostics", b.createModule(.{ .root_source_file = b.path("terminal/diagnostics.zig") }));
    const ownership_tests = b.addTest(.{ .root_module = ownership_test_module });
    ownership_tests.linkLibC();
    const lifecycle_step = b.step("lifecycle-test", "Run independently retained ownership tests");
    lifecycle_step.dependOn(&b.addRunArtifact(ownership_tests).step);
    const process_test_module = b.createModule(.{ .root_source_file = b.path("tests/ghostty_process_control_test.zig"), .target = b.graph.host, .optimize = .Debug });
    const process_guard_module = b.createModule(.{ .root_source_file = b.path("terminal/guard.zig") });
    const process_reducer_module = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    process_test_module.addImport("guard", process_guard_module);
    process_test_module.addImport("reducer", process_reducer_module);
    const process_module = b.createModule(.{ .root_source_file = b.path("terminal/ghostty_process_control.zig") });
    process_module.addImport("guard", process_guard_module);
    process_module.addImport("reducer", process_reducer_module);
    process_module.addIncludePath(include_dir);
    process_test_module.addImport("ghostty_process_control", process_module);
    process_test_module.addLibraryPath(library_dir);
    process_test_module.addRPath(library_dir);
    process_test_module.addCSourceFile(.{ .file = .{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "src", "gl.c" }) }, .flags = &.{} });
    process_test_module.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ source, "vendor", "glad", "include" }) });
    const process_tests = b.addTest(.{ .root_module = process_test_module });
    process_tests.linkLibC();
    process_tests.linkSystemLibrary("ghostty");
    lifecycle_step.dependOn(&b.addRunArtifact(process_tests).step);
}

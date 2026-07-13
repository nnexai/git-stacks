const std = @import("std");

pub fn build(b: *std.Build) void {
    const source = b.option([]const u8, "ghostty-source", "Path to the verified derived Ghostty checkout") orelse
        @panic("-Dghostty-source is required; run through scripts/verify-native.ts");
    const include_dir: std.Build.LazyPath = .{ .cwd_relative = b.pathJoin(&.{ source, "zig-out", "include" }) };
    const library_dir: std.Build.LazyPath = .{ .cwd_relative = b.pathJoin(&.{ source, "zig-out", "lib" }) };
    const terminal_environment_module = b.createModule(.{ .root_source_file = b.path("linux/terminal_environment.zig"), .target = b.graph.host, .optimize = .ReleaseSafe });

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
    const app_model_module = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const app_reducer_module = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    app_reducer_module.addImport("model", app_model_module);
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
    app_module.addImport("terminal_environment", terminal_environment_module);
    app_module.addImport("guard", app_guard_module);
    const app_tab_registry_module = b.createModule(.{ .root_source_file = b.path("linux/tab_registry.zig") });
    app_tab_registry_module.addImport("model", app_model_module);
    const app_service_client_module = b.createModule(.{ .root_source_file = b.path("linux/service_client.zig") });
    app_service_client_module.addImport("model", app_model_module);
    app_service_client_module.addImport("reducer", app_reducer_module);
    const app_graph_module = b.createModule(.{ .root_source_file = b.path("linux/app_graph.zig") });
    app_graph_module.addImport("service_client", app_service_client_module);
    app_graph_module.addImport("tab_registry", app_tab_registry_module);
    app_graph_module.addImport("model", app_model_module);
    app_graph_module.addImport("reducer", app_reducer_module);
    app_module.addImport("app_graph", app_graph_module);
    app_module.addImport("tab_registry", app_tab_registry_module);
    app_module.addImport("model", app_model_module);
    const app_persistence_module = b.createModule(.{ .root_source_file = b.path("core/persistence.zig") });
    app_persistence_module.addImport("model", app_model_module);
    app_module.addImport("persistence", app_persistence_module);
    app_module.addImport("reducer", app_reducer_module);
    app_module.addImport("service_client", app_service_client_module);
    const workspace_module = b.createModule(.{ .root_source_file = b.path("linux/workspace_view.zig") });
    workspace_module.addImport("model", app_model_module);
    const application_module = b.createModule(.{ .root_source_file = b.path("linux/application.zig") });
    application_module.addImport("model", app_model_module);
    application_module.addImport("workspace_view", workspace_module);
    app_module.addImport("application", application_module);
    app_module.addImport("workspace_view", workspace_module);
    const command_launcher_module = b.createModule(.{ .root_source_file = b.path("linux/command_launcher.zig") });
    command_launcher_module.addImport("model", app_model_module);
    app_module.addImport("command_launcher", command_launcher_module);
    const attention_view_module = b.createModule(.{ .root_source_file = b.path("linux/attention_view.zig") });
    attention_view_module.addImport("model", app_model_module);
    attention_view_module.addImport("reducer", app_reducer_module);
    app_module.addImport("attention_view", attention_view_module);
    app_module.addImport("signal_osc", b.createModule(.{ .root_source_file = b.path("linux/signal_osc.zig") }));
    app_module.addImport("workspace_creation", b.createModule(.{ .root_source_file = b.path("linux/workspace_creation.zig") }));
    app_module.addImport("service_sync", b.createModule(.{ .root_source_file = b.path("linux/service_sync.zig") }));
    const app = b.addExecutable(.{ .name = "git-stacks-native", .root_module = app_module });
    app.linkLibC();
    app.linkSystemLibrary("ghostty");
    app.linkSystemLibrary("gtk4");
    app.linkSystemLibrary("adwaita-1");
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
    interaction_test_module.addImport("ghostty_input", input_module);
    interaction_test_module.addImport("terminal_environment", terminal_environment_module);
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
    const ax_attention = b.createModule(.{ .root_source_file = b.path("linux/attention_view.zig") });
    ax_attention.addImport("model", app_model_module);
    ax_attention.addImport("reducer", app_reducer_module);
    accessibility_test_module.addImport("model", app_model_module);
    accessibility_test_module.addImport("attention_view", ax_attention);
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
    model.root_module.addImport("model", b.createModule(.{ .root_source_file = b.path("core/model.zig") }));
    model.linkLibC();
    const model_tests = b.addTest(.{ .root_module = b.createModule(.{ .root_source_file = b.path("core/contract.zig"), .target = b.graph.host, .optimize = .Debug }) });
    const run_model_tests = b.addRunArtifact(model_tests);
    const reducer_test_module = b.createModule(.{ .root_source_file = b.path("tests/reducer_test.zig"), .target = b.graph.host, .optimize = .Debug });
    const tested_reducer = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    tested_reducer.addImport("model", b.createModule(.{ .root_source_file = b.path("core/model.zig") }));
    reducer_test_module.addImport("reducer", tested_reducer);
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
    const tested_persistence = b.createModule(.{ .root_source_file = b.path("core/persistence.zig") });
    tested_persistence.addImport("model", b.createModule(.{ .root_source_file = b.path("core/model.zig") }));
    persistence_test_module.addImport("persistence", tested_persistence);
    const restore_step = b.step("restore-test", "Run presentation restoration and quarantine tests");
    restore_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = persistence_test_module })).step);

    const attention_test_module = b.createModule(.{ .root_source_file = b.path("tests/attention_test.zig"), .target = b.graph.host, .optimize = .Debug });
    const attention_model = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const attention_reducer = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    attention_reducer.addImport("model", attention_model);
    attention_test_module.addImport("reducer", attention_reducer);
    const attention_view_test_module = b.createModule(.{ .root_source_file = b.path("linux/attention_view.zig") });
    attention_view_test_module.addImport("model", attention_model);
    attention_view_test_module.addImport("reducer", attention_reducer);
    attention_test_module.addImport("attention_view", attention_view_test_module);
    const attention_step = b.step("attention-test", "Run structured attention derivation and focus routing tests");
    attention_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = attention_test_module })).step);
    attention_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = b.createModule(.{ .root_source_file = b.path("linux/signal_osc.zig"), .target = b.graph.host, .optimize = .Debug }) })).step);

    const wu_model = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const wu_view = b.createModule(.{ .root_source_file = b.path("linux/workspace_view.zig") });
    wu_view.addImport("model", wu_model);
    const wu_test = b.createModule(.{ .root_source_file = b.path("tests/workspace_ui_test.zig"), .target = b.graph.host, .optimize = .Debug });
    wu_test.addImport("model", wu_model);
    wu_test.addImport("workspace_view", wu_view);
    const workspace_ui_step = b.step("workspace-ui-test", "Run adaptive workspace and pair tab projection tests");
    workspace_ui_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = wu_test })).step);

    const aa_model = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const aa_reducer = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    aa_reducer.addImport("model", aa_model);
    const aa_workspace = b.createModule(.{ .root_source_file = b.path("linux/workspace_view.zig") });
    aa_workspace.addImport("model", aa_model);
    const aa_app = b.createModule(.{ .root_source_file = b.path("linux/application.zig") });
    aa_app.addImport("model", aa_model);
    aa_app.addImport("workspace_view", aa_workspace);
    const aa_launcher = b.createModule(.{ .root_source_file = b.path("linux/command_launcher.zig") });
    aa_launcher.addImport("model", aa_model);
    const aa_attention = b.createModule(.{ .root_source_file = b.path("linux/attention_view.zig") });
    aa_attention.addImport("model", aa_model);
    aa_attention.addImport("reducer", aa_reducer);
    const aa_test = b.createModule(.{ .root_source_file = b.path("tests/application_actions_test.zig"), .target = b.graph.host, .optimize = .Debug });
    aa_test.addImport("model", aa_model);
    aa_test.addImport("application", aa_app);
    aa_test.addImport("command_launcher", aa_launcher);
    aa_test.addImport("attention_view", aa_attention);
    const production_contract = b.createModule(.{ .root_source_file = b.path("linux/app_contract_test.zig"), .target = b.graph.host, .optimize = .Debug });
    production_contract.addImport("application", aa_app);
    aa_test.addImport("production_app_contract", production_contract);
    const application_actions_step = b.step("application-actions-test", "Run scoped application command and attention action tests");
    application_actions_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = aa_test })).step);

    const tabs_module = b.createModule(.{ .root_source_file = b.path("tests/tab_registry_test.zig"), .target = b.graph.host, .optimize = .Debug });
    const tabs_model = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const tabs_registry = b.createModule(.{ .root_source_file = b.path("linux/tab_registry.zig") });
    tabs_registry.addImport("model", tabs_model);
    tabs_module.addImport("model", tabs_model);
    tabs_module.addImport("tab_registry", tabs_registry);
    const tabs_step = b.step("tabs-test", "Run navigation-independent terminal host registry tests");
    tabs_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = tabs_module })).step);
    const service_module = b.createModule(.{ .root_source_file = b.path("tests/service_client_test.zig"), .target = b.graph.host, .optimize = .Debug });
    const tested_service_client = b.createModule(.{ .root_source_file = b.path("linux/service_client.zig") });
    const service_model = b.createModule(.{ .root_source_file = b.path("core/model.zig") });
    const service_reducer = b.createModule(.{ .root_source_file = b.path("core/reducer.zig") });
    service_reducer.addImport("model", service_model);
    tested_service_client.addImport("model", service_model);
    tested_service_client.addImport("reducer", service_reducer);
    service_module.addImport("service_client", tested_service_client);
    const service_step = b.step("service-client-test", "Run authenticated service replay and launch decoding tests");
    service_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = service_module })).step);
    const sync_test_module = b.createModule(.{ .root_source_file = b.path("tests/service_sync_test.zig"), .target = b.graph.host, .optimize = .Debug });
    sync_test_module.addImport("service_sync", b.createModule(.{ .root_source_file = b.path("linux/service_sync.zig") }));
    const sync_step = b.step("service-sync-test", "Run refresh coalescing and replay cursor tests");
    sync_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = sync_test_module })).step);
    const creation_test_module = b.createModule(.{ .root_source_file = b.path("tests/workspace_creation_test.zig"), .target = b.graph.host, .optimize = .Debug });
    creation_test_module.addImport("workspace_creation", b.createModule(.{ .root_source_file = b.path("linux/workspace_creation.zig") }));
    const creation_step = b.step("workspace-creation-test", "Run the GTK-free workspace creation controller tests");
    creation_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = creation_test_module })).step);

    const graph_test_module = b.createModule(.{ .root_source_file = b.path("tests/app_graph_test.zig"), .target = b.graph.host, .optimize = .Debug });
    graph_test_module.addImport("app_graph", app_graph_module);
    graph_test_module.addImport("model", app_model_module);
    const graph_step = b.step("app-graph-test", "Assert the production service and terminal registry composition");
    graph_step.dependOn(&b.addRunArtifact(b.addTest(.{ .root_module = graph_test_module })).step);
    const app_contract_tests = b.addTest(.{ .root_module = production_contract });
    graph_step.dependOn(&b.addRunArtifact(app_contract_tests).step);

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
    process_reducer_module.addImport("model", b.createModule(.{ .root_source_file = b.path("core/model.zig") }));
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

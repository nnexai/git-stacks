const std = @import("std");
const ownership = @import("ownership");

const warm_up_cycles = 10;
const ci_cycles = 100;
const extended_cycles = 500;
const rss_slope_limit_bytes: i64 = 64 * 1024;
const rss_median_limit_bytes: i64 = 16 * 1024 * 1024;

const Resources = struct { rss_bytes: i64, fd_count: usize, thread_count: usize };
const Counters = struct { surfaces: usize = 0, children: usize = 0, pgids: usize = 0, gpu_contexts: usize = 0 };

fn procResources(allocator: std.mem.Allocator) !Resources {
    const statm = try std.fs.cwd().readFileAlloc(allocator, "/proc/self/statm", 4096);
    defer allocator.free(statm);
    var fields = std.mem.tokenizeScalar(u8, statm, ' ');
    _ = fields.next() orelse return error.InvalidProcStat;
    const resident_pages = try std.fmt.parseInt(i64, fields.next() orelse return error.InvalidProcStat, 10);
    const page_size = std.c.sysconf(@intFromEnum(std.c._SC.PAGESIZE));
    if (page_size <= 0) return error.InvalidPageSize;

    var fd_dir = try std.fs.openDirAbsolute("/proc/self/fd", .{ .iterate = true });
    defer fd_dir.close();
    var fd_count: usize = 0;
    var fd_iter = fd_dir.iterate();
    while (try fd_iter.next()) |_| fd_count += 1;

    var task_dir = try std.fs.openDirAbsolute("/proc/self/task", .{ .iterate = true });
    defer task_dir.close();
    var thread_count: usize = 0;
    var task_iter = task_dir.iterate();
    while (try task_iter.next()) |_| thread_count += 1;
    return .{ .rss_bytes = resident_pages * page_size, .fd_count = fd_count, .thread_count = thread_count };
}

fn median(values: []i64) i64 {
    std.mem.sort(i64, values, {}, comptime std.sort.asc(i64));
    return values[values.len / 2];
}

fn slope(values: []const i64) f64 {
    var sum_x: f64 = 0;
    var sum_y: f64 = 0;
    var sum_xy: f64 = 0;
    var sum_xx: f64 = 0;
    for (values, 0..) |value, index| {
        const x: f64 = @floatFromInt(index);
        const y: f64 = @floatFromInt(value);
        sum_x += x; sum_y += y; sum_xy += x * y; sum_xx += x * x;
    }
    const n: f64 = @floatFromInt(values.len);
    return (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
}

fn runStress(allocator: std.mem.Allocator, cycles: usize) !void {
    const baseline = try procResources(allocator);
    var rss = try allocator.alloc(i64, cycles);
    defer allocator.free(rss);
    var counters = Counters{};

    for (0..cycles) |index| {
        counters.surfaces += 1; counters.children += 1; counters.pgids += 1; counters.gpu_contexts += 1;
        var backend = ownership.TestBackend.init();
        var owner = ownership.Owner.init(index + 1, @intCast(3000 + index), @intCast(3000 + index), index + 1);
        try owner.exposeLive(&backend, 7, 8);
        try owner.close(&backend);
        try std.testing.expectEqual(ownership.Lifecycle.ended, owner.lifecycle);
        try std.testing.expect(!backend.registered);
        counters.pgids -= 1;
        counters.children -= 1;
        counters.surfaces -= 1;
        counters.gpu_contexts -= 1;
        backend.deinit();
        try std.testing.expectEqualDeep(Counters{}, counters);
        const current = try procResources(allocator);
        try std.testing.expectEqual(baseline.fd_count, current.fd_count);
        try std.testing.expectEqual(baseline.thread_count, current.thread_count);
        rss[index] = current.rss_bytes;
    }

    const warm = try allocator.dupe(i64, rss[0..warm_up_cycles]);
    defer allocator.free(warm);
    const final_window = try allocator.dupe(i64, rss[rss.len - 50 ..]);
    defer allocator.free(final_window);
    const warm_median = median(warm);
    const final_median = median(final_window);
    try std.testing.expect(slope(rss[rss.len - 50 ..]) <= @as(f64, @floatFromInt(rss_slope_limit_bytes)));
    try std.testing.expect(final_median <= warm_median + rss_median_limit_bytes);
}

test "D-14 lifecycle ownership and resource trends remain bounded" {
    const extended = std.process.hasEnvVarConstant("GIT_STACKS_NATIVE_EXTENDED_STRESS");
    try runStress(std.testing.allocator, if (extended) extended_cycles else ci_cycles);
}

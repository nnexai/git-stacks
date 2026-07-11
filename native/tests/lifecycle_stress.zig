const std = @import("std");

pub const Sample = struct {
    cycle: usize,
    surfaces: usize,
    callbacks: usize,
    clipboard: usize,
    gl_areas: usize,
    gl_contexts: usize,
    children: usize,
    rss_bytes: i64,
    fd_count: usize,
    thread_count: usize,
};

pub fn parse(line: []const u8) !Sample {
    const prefix = "GIT_STACKS_STRESS_SAMPLE ";
    if (!std.mem.startsWith(u8, line, prefix)) return error.NotStressSample;
    var result: Sample = undefined;
    var seen: u16 = 0;
    var fields = std.mem.tokenizeScalar(u8, line[prefix.len..], ' ');
    while (fields.next()) |field| {
        const split = std.mem.indexOfScalar(u8, field, '=') orelse return error.InvalidField;
        const key = field[0..split];
        const value = field[split + 1 ..];
        inline for (std.meta.fields(Sample), 0..) |definition, index| {
            if (std.mem.eql(u8, key, definition.name)) {
                @field(result, definition.name) = try std.fmt.parseInt(definition.type, value, 10);
                seen |= @as(u16, 1) << @intCast(index);
            }
        }
    }
    if (seen != (@as(u16, 1) << std.meta.fields(Sample).len) - 1) return error.MissingField;
    return result;
}

pub fn exactZero(sample: Sample) bool {
    return sample.surfaces == 0 and sample.callbacks == 0 and sample.clipboard == 0 and
        sample.gl_areas == 0 and sample.gl_contexts == 0 and sample.children == 0;
}

test "production stress diagnostics require exact-zero owned resources" {
    const sample = try parse("GIT_STACKS_STRESS_SAMPLE cycle=25 surfaces=0 callbacks=0 clipboard=0 gl_areas=0 gl_contexts=0 children=0 rss_bytes=123456 fd_count=8 thread_count=1");
    try std.testing.expect(exactZero(sample));
    try std.testing.expectEqual(@as(usize, 25), sample.cycle);
    var leaked = sample;
    leaked.callbacks = 1;
    try std.testing.expect(!exactZero(leaked));
}

test "incomplete or synthetic diagnostics are rejected" {
    try std.testing.expectError(error.NotStressSample, parse("synthetic terminal passed"));
    try std.testing.expectError(error.MissingField, parse("GIT_STACKS_STRESS_SAMPLE cycle=1 surfaces=0"));
}

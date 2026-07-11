const std = @import("std");
const contract = @import("contract.zig");
const state_model = @import("model.zig");
const reducer = @import("reducer.zig");

const allocator = std.heap.c_allocator;
const Bytes = extern struct { ptr: ?[*]const u8, len: usize };
const Model = struct { magic: u64 = live_magic, alive: bool = true, json: []u8, state: state_model.State = .{} };
const live_magic: u64 = 0x47535441434b5331;

const ok: c_int = 0;
const invalid_argument: c_int = 1;
const input_too_large: c_int = 2;
const invalid_utf8: c_int = 3;
const invalid_json: c_int = 4;
const abi_mismatch: c_int = 5;
const invalid_identity: c_int = 6;
const invalid_lifetime: c_int = 7;
const allocation_misuse: c_int = 8;
const out_of_memory: c_int = 9;

var allocation_mutex = std.Thread.Mutex{};
var allocations: std.AutoHashMapUnmanaged(usize, usize) = .empty;

export fn gs_native_abi_version_v1() u32 { return 1; }

fn clear(out: ?*Bytes) void { if (out) |value| value.* = .{ .ptr = null, .len = 0 }; }

fn allocateBytes(source: []const u8, out: *Bytes) c_int {
    const copy = allocator.dupe(u8, source) catch return out_of_memory;
    allocation_mutex.lock();
    defer allocation_mutex.unlock();
    allocations.put(allocator, @intFromPtr(copy.ptr), copy.len) catch {
        allocator.free(copy);
        return out_of_memory;
    };
    out.* = .{ .ptr = copy.ptr, .len = copy.len };
    return ok;
}

fn fail(status: c_int, code: []const u8, out_error: ?*Bytes) c_int {
    if (out_error) |out| {
        var buffer: [192]u8 = undefined;
        const json = std.fmt.bufPrint(&buffer, "{{\"protocol\":\"v1\",\"ok\":false,\"error\":{{\"code\":\"{s}\",\"message\":\"native ABI rejected input\"}}}}", .{code}) catch return status;
        _ = allocateBytes(json, out);
    }
    return status;
}

fn slice(bytes: Bytes) ?[]const u8 {
    if (bytes.len == 0) return &.{};
    const ptr = bytes.ptr orelse return null;
    return ptr[0..bytes.len];
}
fn jsonId(object: std.json.ObjectMap, key: []const u8) ?state_model.Id {
    const value = object.get(key) orelse return null;
    if (value != .string or value.string.len != 36) return null;
    var id: state_model.Id = undefined;
    @memcpy(&id, value.string);
    return id;
}
fn jsonU64(object: std.json.ObjectMap, key: []const u8) ?u64 {
    const value = object.get(key) orelse return null;
    return if (value == .integer and value.integer >= 0) @intCast(value.integer) else null;
}

export fn gs_model_create_v1(version: u32, input: Bytes, out_model: ?*?*Model, out_error: ?*Bytes) c_int {
    clear(out_error);
    const target = out_model orelse return fail(invalid_argument, "invalid_request", out_error);
    target.* = null;
    if (version != 1) return fail(abi_mismatch, "invalid_request", out_error);
    const bytes = slice(input) orelse return fail(invalid_argument, "invalid_request", out_error);
    contract.validate(bytes) catch |err| return switch (err) {
        error.InvalidLength => fail(input_too_large, "invalid_request", out_error),
        error.InvalidUtf8 => fail(invalid_utf8, "invalid_request", out_error),
        error.InvalidJson => fail(invalid_json, "invalid_request", out_error),
        error.VersionMismatch => fail(abi_mismatch, "invalid_request", out_error),
        error.InvalidIdentity => fail(invalid_identity, "invalid_request", out_error),
    };
    const model = allocator.create(Model) catch return fail(out_of_memory, "internal_error", out_error);
    const copy = allocator.dupe(u8, bytes) catch { allocator.destroy(model); return fail(out_of_memory, "internal_error", out_error); };
    model.* = .{ .json = copy };
    target.* = model;
    return ok;
}

export fn gs_model_snapshot_v1(model: ?*Model, out_json: ?*Bytes, out_error: ?*Bytes) c_int {
    clear(out_json); clear(out_error);
    const value = model orelse return fail(invalid_argument, "invalid_request", out_error);
    if (value.magic != live_magic or !value.alive) return fail(invalid_lifetime, "invalid_request", out_error);
    const out = out_json orelse return fail(invalid_argument, "invalid_request", out_error);
    return allocateBytes(value.json, out);
}

export fn gs_model_dispatch_v1(model: ?*Model, input: Bytes, out_json: ?*Bytes, out_error: ?*Bytes) c_int {
    clear(out_json); clear(out_error);
    const value = model orelse return fail(invalid_argument, "invalid_request", out_error);
    if (value.magic != live_magic or !value.alive) return fail(invalid_lifetime, "invalid_request", out_error);
    const bytes = slice(input) orelse return fail(invalid_argument, "invalid_request", out_error);
    if (bytes.len == 0 or bytes.len > contract.max_input_bytes) return fail(input_too_large, "invalid_request", out_error);
    const parsed = std.json.parseFromSlice(std.json.Value, allocator, bytes, .{}) catch return fail(invalid_json, "invalid_request", out_error);
    defer parsed.deinit();
    if (parsed.value != .object) return fail(invalid_json, "invalid_request", out_error);
    const kind = parsed.value.object.get("type") orelse return fail(invalid_json, "invalid_request", out_error);
    if (kind != .string) return fail(invalid_json, "invalid_request", out_error);
    const object = parsed.value.object;
    const action: reducer.Action = if (std.mem.eql(u8, kind.string, "disconnected")) .disconnected
        else if (std.mem.eql(u8, kind.string, "unknown_optional")) .unknown_optional
        else if (std.mem.eql(u8, kind.string, "incompatible")) .incompatible
        else if (std.mem.eql(u8, kind.string, "connected")) .{ .connected = .{ .revision = jsonU64(object,"revision") orelse return fail(invalid_json,"invalid_request",out_error), .sequence = jsonU64(object,"sequence") orelse return fail(invalid_json,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "event")) .{ .event = .{ .revision = jsonU64(object,"revision") orelse return fail(invalid_json,"invalid_request",out_error), .sequence = jsonU64(object,"sequence") orelse return fail(invalid_json,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "refreshed")) .{ .refreshed = .{ .revision = jsonU64(object,"revision") orelse return fail(invalid_json,"invalid_request",out_error), .sequence = jsonU64(object,"sequence") orelse return fail(invalid_json,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "select_attention")) .{ .select_attention = .{ .attention_id = jsonId(object,"attention_id") orelse return fail(invalid_identity,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "exact_tab_visible")) .{ .exact_tab_visible = .{ .surface_id = jsonId(object,"surface_id") orelse return fail(invalid_identity,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "remove_attention")) .{ .remove_attention = .{ .attention_id = jsonId(object,"attention_id") orelse return fail(invalid_identity,"invalid_request",out_error) } }
        else if (std.mem.eql(u8, kind.string, "navigate_pair")) .{ .navigate_pair = .{ .workspace_id = jsonId(object,"workspace_id") orelse return fail(invalid_identity,"invalid_request",out_error), .repository_id = jsonId(object,"repository_id") orelse return fail(invalid_identity,"invalid_request",out_error) } }
        else return fail(invalid_json, "invalid_request", out_error);
    const reduced = reducer.reduce(value.state, action);
    value.state = reduced.state;
    const canonical = state_model.canonicalAlloc(allocator, value.state) catch return fail(out_of_memory, "internal_error", out_error);
    allocator.free(value.json); value.json = canonical;
    const out = out_json orelse return fail(invalid_argument, "invalid_request", out_error);
    const effect_name = @tagName(reduced.effect);
    const response = std.fmt.allocPrint(allocator, "{{\"protocol\":\"v1\",\"state\":{s},\"effect\":\"{s}\"}}", .{value.json,effect_name}) catch return fail(out_of_memory,"internal_error",out_error);
    defer allocator.free(response);
    return allocateBytes(response, out);
}

export fn gs_model_destroy_v1(model: ?*Model, out_error: ?*Bytes) c_int {
    clear(out_error);
    const value = model orelse return fail(invalid_argument, "invalid_request", out_error);
    if (value.magic != live_magic or !value.alive) return fail(invalid_lifetime, "invalid_request", out_error);
    allocator.free(value.json);
    value.json = &.{};
    value.alive = false;
    return ok;
}

export fn gs_bytes_free_v1(bytes: Bytes) c_int {
    if (bytes.len == 0 and bytes.ptr == null) return ok;
    const ptr = bytes.ptr orelse return allocation_misuse;
    allocation_mutex.lock();
    defer allocation_mutex.unlock();
    const address = @intFromPtr(ptr);
    const length = allocations.get(address) orelse return allocation_misuse;
    if (length != bytes.len) return allocation_misuse;
    _ = allocations.remove(address);
    allocator.free(@constCast(ptr[0..length]));
    return ok;
}

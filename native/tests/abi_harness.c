#include "git_stacks_native_v1.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static gs_bytes_v1 bytes(const void *ptr, size_t len) { gs_bytes_v1 b = {(const uint8_t *)ptr, len}; return b; }
static int contains(gs_bytes_v1 haystack, const char *needle) {
  size_t n = strlen(needle);
  for (size_t i = 0; i + n <= haystack.len; i++) if (memcmp(haystack.ptr + i, needle, n) == 0) return 1;
  return 0;
}

static void roundtrip_file(const char *path) {
  FILE *fixture = fopen(path, "rb");
  char corpus[GS_NATIVE_MAX_INPUT_V1];
  assert(fixture);
  size_t len = fread(corpus, 1, sizeof(corpus), fixture);
  assert(!ferror(fixture) && feof(fixture)); fclose(fixture);
  gs_model_v1 *model = NULL; gs_bytes_v1 error = {0}, output = {0};
  assert(gs_model_create_v1(GS_NATIVE_ABI_V1, bytes(corpus, len), &model, &error) == GS_OK_V1);
  assert(gs_model_snapshot_v1(model, &output, &error) == GS_OK_V1);
  assert(output.len == len && memcmp(output.ptr, corpus, len) == 0);
  assert(gs_bytes_free_v1(output) == GS_OK_V1);
  assert(gs_model_destroy_v1(model, &error) == GS_OK_V1);
}

int main(int argc, char **argv) {
  const char *fallback = "{\"protocol\":\"v1\",\"request_id\":\"req_0123456789abcdef\",\"ok\":true}";
  const char *json = fallback;
  size_t len = strlen(fallback);
  FILE *fixture = NULL;
  char corpus[GS_NATIVE_MAX_INPUT_V1];
  if (argc == 2) {
    fixture = fopen(argv[1], "rb"); assert(fixture);
    len = fread(corpus, 1, sizeof(corpus), fixture); assert(!ferror(fixture)); assert(feof(fixture)); fclose(fixture);
    json = corpus;
  }
  assert(gs_native_abi_version_v1() == GS_NATIVE_ABI_V1);
  gs_model_v1 *model = NULL; gs_bytes_v1 error = {0};
  assert(gs_model_create_v1(GS_NATIVE_ABI_V1, bytes(json, len), &model, &error) == GS_OK_V1);
  gs_bytes_v1 output = {0};
  assert(gs_model_snapshot_v1(model, &output, &error) == GS_OK_V1);
  assert(output.len == len && memcmp(output.ptr, json, len) == 0);
  gs_bytes_v1 saved = output;
  assert(gs_bytes_free_v1(output) == GS_OK_V1);
  const char *action = "{\"type\":\"unknown_optional\"}";
  assert(gs_model_dispatch_v1(model, bytes(action, strlen(action)), &output, &error) == GS_OK_V1);
  assert(contains(output, "\"degraded_optional_count\":1"));
  assert(gs_bytes_free_v1(output) == GS_OK_V1);
  assert(gs_bytes_free_v1(saved) == GS_ALLOCATION_MISUSE_V1);
  assert(gs_model_destroy_v1(model, &error) == GS_OK_V1);
  assert(gs_model_destroy_v1(model, &error) == GS_INVALID_LIFETIME_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  assert(gs_model_snapshot_v1(model, &output, &error) == GS_INVALID_LIFETIME_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  assert(gs_model_create_v1(2, bytes(json, len), &model, &error) == GS_ABI_MISMATCH_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  assert(gs_model_create_v1(1, bytes(NULL, 2), &model, &error) == GS_INVALID_ARGUMENT_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  assert(gs_model_create_v1(1, bytes(json, GS_NATIVE_MAX_INPUT_V1 + 1u), &model, &error) == GS_INPUT_TOO_LARGE_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  const uint8_t bad_utf8[] = {0xff}; assert(gs_model_create_v1(1, bytes(bad_utf8, 1), &model, &error) == GS_INVALID_UTF8_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  assert(gs_model_create_v1(1, bytes("{", 1), &model, &error) == GS_INVALID_JSON_V1); assert(gs_bytes_free_v1(error) == GS_OK_V1);
  roundtrip_file("tests/fixtures/discovery.json");
  roundtrip_file("tests/fixtures/workspace-snapshot.json");
  roundtrip_file("tests/fixtures/request-timeout-error.json");
  puts("native ABI harness passed");
  return 0;
}

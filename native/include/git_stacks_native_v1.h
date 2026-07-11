#ifndef GIT_STACKS_NATIVE_V1_H
#define GIT_STACKS_NATIVE_V1_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GS_NATIVE_ABI_V1 UINT32_C(1)
#define GS_NATIVE_MAX_INPUT_V1 (UINT32_C(1024) * UINT32_C(1024))

typedef struct gs_model_v1 gs_model_v1;
typedef struct { const uint8_t *ptr; size_t len; } gs_bytes_v1;
typedef int32_t gs_status_v1;

enum {
  GS_OK_V1 = 0,
  GS_INVALID_ARGUMENT_V1 = 1,
  GS_INPUT_TOO_LARGE_V1 = 2,
  GS_INVALID_UTF8_V1 = 3,
  GS_INVALID_JSON_V1 = 4,
  GS_ABI_MISMATCH_V1 = 5,
  GS_INVALID_IDENTITY_V1 = 6,
  GS_INVALID_LIFETIME_V1 = 7,
  GS_ALLOCATION_MISUSE_V1 = 8,
  GS_OUT_OF_MEMORY_V1 = 9
};

uint32_t gs_native_abi_version_v1(void);
gs_status_v1 gs_model_create_v1(uint32_t abi_version, gs_bytes_v1 initial_json,
                                gs_model_v1 **out_model, gs_bytes_v1 *out_error);
gs_status_v1 gs_model_snapshot_v1(gs_model_v1 *model, gs_bytes_v1 *out_json,
                                  gs_bytes_v1 *out_error);
gs_status_v1 gs_model_dispatch_v1(gs_model_v1 *model, gs_bytes_v1 action_json,
                                  gs_bytes_v1 *out_snapshot, gs_bytes_v1 *out_error);
gs_status_v1 gs_model_destroy_v1(gs_model_v1 *model, gs_bytes_v1 *out_error);
gs_status_v1 gs_bytes_free_v1(gs_bytes_v1 bytes);

#ifdef __cplusplus
}
#endif
#endif

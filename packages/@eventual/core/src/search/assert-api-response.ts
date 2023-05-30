import type { ApiResponse } from "@opensearch-project/opensearch";

export function assertApiResponseOK(response: ApiResponse) {
  if (
    response.statusCode !== 200 &&
    response.statusCode !== 201 &&
    response.statusCode !== 202
  ) {
    throw new Error(
      `Request failed with ${response.statusCode} and warnings ${response.warnings}`
    );
  }
}

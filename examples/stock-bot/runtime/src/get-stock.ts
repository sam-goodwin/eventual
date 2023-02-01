import { api, ApiResponse, duration } from "@eventual/core";

export const getStock = api.get(
  "/stock/:stockId",
  {
    memorySize: 512,
    timeout: duration(1, "minute"),
  },
  async () => {
    return new ApiResponse();
  }
);

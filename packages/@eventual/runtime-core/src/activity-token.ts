import { Buffer } from "buffer";
export interface ActivityTokenPayload {
  seq: number;
  executionId: string;
}

export interface ActivityTokenWrapper {
  version: 1;
  payload: ActivityTokenPayload;
}

export function createActivityToken(executionId: string, seq: number): string {
  const tokenWrapper: ActivityTokenWrapper = {
    payload: {
      executionId,
      seq,
    },
    version: 1,
  };

  return Buffer.from(JSON.stringify(tokenWrapper)).toString("base64");
}

export function decodeActivityToken(token: string): ActivityTokenWrapper {
  return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
}

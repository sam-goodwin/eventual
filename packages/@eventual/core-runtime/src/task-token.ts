import { Buffer } from "buffer";
export interface TaskTokenPayload {
  seq: number;
  executionId: string;
}

export interface TaskTokenWrapper {
  version: 1;
  payload: TaskTokenPayload;
}

export function createTaskToken(executionId: string, seq: number): string {
  const tokenWrapper: TaskTokenWrapper = {
    payload: {
      executionId,
      seq,
    },
    version: 1,
  };

  return Buffer.from(JSON.stringify(tokenWrapper)).toString("base64");
}

export function decodeTaskToken(token: string): TaskTokenWrapper {
  return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
}

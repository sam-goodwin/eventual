import { Queue } from "@eventual/core";
import { QueueMethod } from "@eventual/core/internal";

export type QueueClient = {
  [K in keyof Pick<Queue, QueueMethod>]: (
    queueName: string,
    ...args: Parameters<Queue[K]>
  ) => ReturnType<Queue[K]>;
} & {
  physicalName: (queueName: string) => string;
};
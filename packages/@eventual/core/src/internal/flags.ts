import type { AsyncLocalStorage } from "async_hooks";
import { ServiceType } from "./service-type.js";

declare global {
  // eslint-disable-next-line no-var
  var serviceTypeStore: AsyncLocalStorage<ServiceType> | undefined;
}

export function isTaskWorker() {
  return globalThis.serviceTypeStore?.getStore() === ServiceType.TaskWorker;
}

export function isApiHandler() {
  return globalThis.serviceTypeStore?.getStore() === ServiceType.CommandWorker;
}

export function isOrchestratorWorker() {
  return (
    globalThis.serviceTypeStore?.getStore() === ServiceType.OrchestratorWorker
  );
}

export function isTransactionWorker() {
  return (
    globalThis.serviceTypeStore?.getStore() === ServiceType.TransactionWorker
  );
}

export function isEventHandler() {
  return globalThis.serviceTypeStore?.getStore() === ServiceType.Subscription;
}

export async function serviceTypeScope<Output>(
  serviceType: ServiceType,
  handler: () => Output
): Promise<Awaited<Output>> {
  if (!globalThis.serviceTypeStore) {
    globalThis.serviceTypeStore = new (
      await import("async_hooks")
    ).AsyncLocalStorage();
  }
  return await globalThis.serviceTypeStore!.run(serviceType, async () => {
    return await handler();
  });
}

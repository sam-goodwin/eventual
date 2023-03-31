import type { AsyncLocalStorage } from "async_hooks";
import { ServiceType } from "./service-type.js";

declare global {
  var serviceTypeStore: AsyncLocalStorage<ServiceType> | undefined;
}

export function isActivityWorker() {
  return globalThis.serviceTypeStore?.getStore() === ServiceType.ActivityWorker;
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

import { AsyncLocalStorage } from "async_hooks";
import { ServiceType } from "./service-type.js";

declare global {
  var serviceTypeStore: AsyncLocalStorage<ServiceType>;
}

globalThis.serviceTypeStore = new AsyncLocalStorage<ServiceType>();

export function isActivityWorker() {
  return globalThis.serviceTypeStore.getStore() === ServiceType.ActivityWorker;
}

export function isApiHandler() {
  return globalThis.serviceTypeStore.getStore() === ServiceType.CommandWorker;
}

export function isOrchestratorWorker() {
  return (
    globalThis.serviceTypeStore.getStore() === ServiceType.OrchestratorWorker
  );
}

export function isEventHandler() {
  return globalThis.serviceTypeStore.getStore() === ServiceType.Subscription;
}

export async function serviceTypeScope<Output>(
  serviceType: ServiceType,
  handler: () => Output
): Promise<Awaited<Output>> {
  return await globalThis.serviceTypeStore.run(serviceType, async () => {
    return await handler();
  });
}

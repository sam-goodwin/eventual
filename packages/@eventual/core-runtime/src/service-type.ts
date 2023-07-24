import { ServiceType } from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";

declare global {
  // eslint-disable-next-line no-var
  var serviceTypeStore: AsyncLocalStorage<ServiceType> | undefined;
}

if (!globalThis.serviceTypeHook || globalThis.serviceTypeHook.default) {
  globalThis.serviceTypeHook = {
    default: false,
    getServiceType() {
      return globalThis.serviceTypeStore?.getStore();
    },
  };
}

export async function serviceTypeScope<Output>(
  serviceType: ServiceType,
  handler: () => Output
): Promise<Awaited<Output>> {
  if (!globalThis.serviceTypeStore) {
    globalThis.serviceTypeStore = new AsyncLocalStorage();
  }
  return await globalThis.serviceTypeStore!.run(serviceType, async () => {
    return await handler();
  });
}

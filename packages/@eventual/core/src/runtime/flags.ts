import { ServiceType } from "../service-type.js";

export const SERVICE_TYPE_FLAG = "EVENTUAL_SERVICE_TYPE";

export function isActivityWorker() {
  return process.env[SERVICE_TYPE_FLAG] === ServiceType.ActivityWorker;
}

export function isApiHandler() {
  return process.env[SERVICE_TYPE_FLAG] === ServiceType.ApiHandler;
}

export function isOrchestratorWorker() {
  return process.env[SERVICE_TYPE_FLAG] === ServiceType.OrchestratorWorker;
}

export function isEventHandler() {
  return process.env[SERVICE_TYPE_FLAG] === ServiceType.EventHandler;
}

export async function serviceTypeScope<Output>(
  serviceType: ServiceType,
  handler: () => Output
): Promise<Awaited<Output>> {
  const back = process.env[SERVICE_TYPE_FLAG];
  try {
    process.env[SERVICE_TYPE_FLAG] = serviceType;
    // await before return so that the promise is completed before the finally call.
    return await handler();
  } finally {
    process.env[SERVICE_TYPE_FLAG] = back;
  }
}

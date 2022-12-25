import { ServiceType, SERVICE_TYPE_FLAG } from "@eventual/core";

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

export enum ServiceType {
  CommandWorker = "CommandWorker",
  Subscription = "Subscription",
  OrchestratorWorker = "OrchestratorWorker",
  EntityStreamWorker = "EntityStreamWorker",
  BucketNotificationHandlerWorker = "BucketNotificationHandlerWorker",
  TaskWorker = "TaskWorker",
  TransactionWorker = "TransactionWorker",
}

// the hook is set by core-runtime. use the is[serviceType] functions to access this system.
declare global {
  // eslint-disable-next-line no-var
  var serviceTypeHook: ServiceTypeHook;
}

export interface ServiceTypeHook {
  default: boolean;
  getServiceType(): ServiceType | undefined;
}

export function isServiceType(serviceType: ServiceType) {
  return globalThis.serviceTypeHook?.getServiceType?.() === serviceType;
}

export function isTaskWorker() {
  return isServiceType(ServiceType.TaskWorker);
}

export function isApiHandler() {
  return isServiceType(ServiceType.CommandWorker);
}

export function isOrchestratorWorker() {
  return isServiceType(ServiceType.OrchestratorWorker);
}

export function isTransactionWorker() {
  return isServiceType(ServiceType.TransactionWorker);
}

export function isSubscriptionHandler() {
  return isServiceType(ServiceType.Subscription);
}

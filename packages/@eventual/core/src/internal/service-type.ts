import { PropertyKind, createEventualProperty } from "./properties.js";

export enum ServiceType {
  CommandWorker = "CommandWorker",
  Subscription = "Subscription",
  OrchestratorWorker = "OrchestratorWorker",
  EntityStreamWorker = "EntityStreamWorker",
  BucketNotificationHandlerWorker = "BucketNotificationHandlerWorker",
  TaskWorker = "TaskWorker",
  TransactionWorker = "TransactionWorker",
}

export function isServiceType(serviceType: ServiceType) {
  return (
    tryGetEventualHook()?.getEventualProperty(
      createEventualProperty(PropertyKind.ServiceType, {})
    ) === serviceType
  );
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

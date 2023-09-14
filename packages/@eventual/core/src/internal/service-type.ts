import { PropertyKind, createEventualProperty } from "./properties.js";

export enum ServiceType {
  BucketNotificationHandlerWorker = "BucketNotificationHandlerWorker",
  CommandWorker = "CommandWorker",
  EntityStreamWorker = "EntityStreamWorker",
  OrchestratorWorker = "OrchestratorWorker",
  QueueHandlerWorker = "QueueHandlerWorker",
  SocketWorker = "SocketWorker",
  Subscription = "Subscription",
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

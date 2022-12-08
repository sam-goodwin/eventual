export enum ServiceType {
  ActivityWorker = "ActivityWorker",
  ApiHandler = "ApiHandler",
  EventHandler = "EventHandler",
  OrchestratorWorker = "OrchestratorWorker",
}

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

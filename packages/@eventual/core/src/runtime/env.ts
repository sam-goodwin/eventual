export namespace CoreEnvFlags {
  /**
   * A flag that determines if a function is an activity worker.
   *
   * Activity calls behave different based on their context.
   */
  export const WORKER_FLAG = "EVENTUAL_WORKER";
  /**
   * A flag that determines if a function is the webhook endpoint.
   */
  export const WEBHOOK_FLAG = "EVENTUAL_WEBHOOK";
  /**
   * A flag that determines if a function is the orchestrator.
   */
  export const ORCHESTRATOR_FLAG = "EVENTUAL_ORCHESTRATOR";
}

export function isActivityWorker() {
  return !!process.env[CoreEnvFlags.WORKER_FLAG];
}

export function isWebhookWorker() {
  return !!process.env[CoreEnvFlags.WEBHOOK_FLAG];
}

export function isOrchestratorWorker() {
  return !!process.env[CoreEnvFlags.ORCHESTRATOR_FLAG];
}

import type { Workflow } from "@eventual/core";
import {
  ServiceSpec,
  getEventualResource,
  getEventualResources,
} from "@eventual/core/internal";

export interface WorkflowProvider extends WorkflowSpecProvider {
  lookupWorkflow(workflowName: string): Workflow | undefined;
}

export interface WorkflowSpecProvider {
  workflowExists(workflowName: string): boolean;
  getWorkflowNames(): string[];
}

/**
 * Returns workflows from the global {@link workflows()}.
 *
 * Note: the service entry point is required to access {@link workflows()}.
 */
export class GlobalWorkflowProvider implements WorkflowProvider {
  public lookupWorkflow(workflowName: string): Workflow | undefined {
    return getEventualResource("Workflow", workflowName);
  }

  public getWorkflowNames(): string[] {
    return [...getEventualResources("Workflow").keys()];
  }

  public workflowExists(workflowName: string): boolean {
    return !!this.lookupWorkflow(workflowName);
  }
}

export class ServiceSpecWorkflowProvider implements WorkflowSpecProvider {
  private workflowNames: Set<string>;
  constructor(serviceSpec: ServiceSpec) {
    this.workflowNames = new Set(serviceSpec.workflows.map((w) => w.name));
  }

  public workflowExists(workflowName: string): boolean {
    return this.workflowNames.has(workflowName);
  }

  public getWorkflowNames(): string[] {
    return [...this.workflowNames];
  }
}

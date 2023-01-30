import { AppSpec, Workflow, workflows } from "@eventual/core";

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
    return workflows().get(workflowName);
  }

  public workflowExists(workflowName: string): boolean {
    return !!this.lookupWorkflow(workflowName);
  }

  public getWorkflowNames(): string[] {
    return Object.keys(workflows());
  }
}

export class AppSpecWorkflowProvider implements WorkflowSpecProvider {
  private workflowNames: Set<string>;
  constructor(appSpec: AppSpec) {
    this.workflowNames = new Set(appSpec.workflows.map((w) => w.name));
  }

  public workflowExists(workflowName: string): boolean {
    return this.workflowNames.has(workflowName);
  }

  public getWorkflowNames(): string[] {
    return [...this.workflowNames];
  }
}

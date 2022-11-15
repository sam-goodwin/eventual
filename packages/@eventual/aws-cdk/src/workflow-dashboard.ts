import { aws_cloudwatch } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Workflow } from "./workflow";

export interface WorkflowDashboardProps {
  workflow: Workflow;
}

export class WorkflowDashboard extends Construct {
  public readonly dashboard: aws_cloudwatch.Dashboard;

  constructor(
    scope: Construct,
    id: string,
    { workflow }: WorkflowDashboardProps
  ) {
    super(scope, id);

    this.dashboard = new aws_cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `Workflow - ${workflow.workflowName}`,
      widgets: [
        [
          new aws_cloudwatch.GraphWidget({
            title: `Orchestrator Function`,
            left: [
              workflow.orchestrator.metricInvocations(),
              workflow.orchestrator.metricErrors(),
              workflow.orchestrator.metricThrottles(),
            ],
            right: [workflow.orchestrator.metricDuration()],
          }),
          new aws_cloudwatch.GraphWidget({
            title: `Execution History`,
            left: [
              workflow.metricLoadHistoryDuration(),
              workflow.metricSaveHistoryDuration(),
            ],
            right: [workflow.metricHistoryNumEvents()],
          }),
        ],
      ],
    });
  }
}

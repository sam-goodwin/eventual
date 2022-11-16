import { aws_cloudwatch } from "aws-cdk-lib";
import { Statistic, Unit } from "aws-cdk-lib/aws-cloudwatch";
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
      dashboardName: `Workflow-${workflow.workflowName.replace(
        /[^A-Za-z0-9_-]/g,
        ""
      )}`,
      widgets: [
        [
          new aws_cloudwatch.GraphWidget({
            title: `Health of the Orchestrator's Lambda Function`,
            left: [
              workflow.orchestrator.metricInvocations(),
              workflow.orchestrator.metricErrors(),
              workflow.orchestrator.metricThrottles(),
            ],
            right: [workflow.orchestrator.metricDuration()],
            width: 12,
          }),
          new aws_cloudwatch.GraphWidget({
            title: `How well the Orchestrator FIFO Queue is keeping up`,
            left: [
              workflow.workflowQueue.metricApproximateAgeOfOldestMessage({
                label:
                  "Approximate age of oldest message in the Orchestrator's SQS FIFO Queue",
              }),
              workflow.metricMaxTaskAge({
                label:
                  "Average age of the oldest Task in a single SQS batch to the Orchestrator",
                statistic: Statistic.MAXIMUM,
                unit: Unit.COUNT,
              }),
              workflow.metricMaxTaskAge({
                label: "Maximum age of any Task processed by the Orchestrator",
                statistic: Statistic.MAXIMUM,
                unit: Unit.COUNT,
              }),
            ],
            width: 12,
          }),
        ],
        [
          new aws_cloudwatch.GraphWidget({
            title: `Size and timing impact of the History S3 Object on the Orchestrator`,
            left: [
              workflow.orchestrator.metricDuration({
                label: "Time taken to process a batch of messages",
              }),
              workflow.metricLoadHistoryDuration({
                label: "Time taken to download history from S3",
              }),
              workflow.metricSaveHistoryDuration({
                label: "Time taken to save history to S3",
              }),
              workflow.metricInvokeCommandsDuration({
                label: "Time taken to invoke commands",
              }),
              workflow.metricAdvanceExecutionDuration(),
            ],
            right: [
              workflow.metricHistoryNumEvents({
                label: "Average number of events in the History",
              }),
              workflow.metricHistoryNumEvents({
                label: "Maximum number of events in the History",
                statistic: Statistic.MAXIMUM,
              }),
            ],
            width: 12,
          }),
          new aws_cloudwatch.GraphWidget({
            title: `Command invoked by the Orchestrator`,
            left: [
              workflow.metricInvokeCommandsDuration({
                label:
                  "Time taken to invoke all Commands output by a Workflow step",
              }),
            ],
            right: [
              workflow.metricCommandsInvoked({
                label: "Average number of Commands output by a Workflow step",
              }),
              workflow.metricCommandsInvoked({
                label: "Maximum number of Commands output by a Workflow step",
                statistic: Statistic.MAXIMUM,
              }),
            ],
            width: 12,
          }),
        ],
      ],
    });
  }
}

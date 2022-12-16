import { aws_cloudwatch } from "aws-cdk-lib";
import { Statistic, Unit } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { Service } from "./service";

export interface ServiceDashboardProps {
  service: Service;
}

export class ServiceDashboard extends Construct {
  public readonly dashboard: aws_cloudwatch.Dashboard;

  constructor(
    scope: Construct,
    id: string,
    { service }: ServiceDashboardProps
  ) {
    super(scope, id);

    this.dashboard = new aws_cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `Workflow-${service.serviceName.replace(
        /[^A-Za-z0-9_-]/g,
        ""
      )}`,
      widgets: [
        [
          new aws_cloudwatch.GraphWidget({
            title: `Health of the Orchestrator's Lambda Function`,
            left: [
              service.workflows.orchestrator.metricInvocations(),
              service.workflows.orchestrator.metricErrors(),
              service.workflows.orchestrator.metricThrottles(),
            ],
            right: [service.workflows.orchestrator.metricDuration()],
            width: 12,
          }),
          new aws_cloudwatch.GraphWidget({
            title: `How well the Orchestrator FIFO Queue is keeping up`,
            left: [
              service.workflows.queue.metricApproximateAgeOfOldestMessage({
                label:
                  "Approximate age of oldest message in the Orchestrator's SQS FIFO Queue",
              }),
              service.metricMaxTaskAge({
                label:
                  "Average age of the oldest Task in a single SQS batch to the Orchestrator",
                statistic: Statistic.MAXIMUM,
                unit: Unit.COUNT,
              }),
              service.metricMaxTaskAge({
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
              service.workflows.orchestrator.metricDuration({
                label: "Time taken to process a batch of messages",
              }),
              service.metricLoadHistoryDuration({
                label: "Time taken to download history from S3",
              }),
              service.metricSaveHistoryDuration({
                label: "Time taken to save history to S3",
              }),
              service.metricInvokeCommandsDuration({
                label: "Time taken to invoke commands",
              }),
              service.metricAdvanceExecutionDuration(),
            ],
            right: [
              service.metricSavedHistoryEvents({
                label: "Average number of events in the History",
              }),
              service.metricSavedHistoryEvents({
                label: "Maximum number of events in the History",
                statistic: Statistic.MAXIMUM,
              }),
            ],
            width: 12,
          }),
          new aws_cloudwatch.GraphWidget({
            title: `Command invoked by the Orchestrator`,
            left: [
              service.metricInvokeCommandsDuration({
                label:
                  "Time taken to invoke all Commands output by a Workflow step",
              }),
            ],
            right: [
              service.metricCommandsInvoked({
                label: "Average number of Commands output by a Workflow step",
              }),
              service.metricCommandsInvoked({
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

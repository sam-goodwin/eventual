import {
  Dashboard,
  GraphWidget,
  MathExpression,
  Statistic,
} from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { Service } from "./service";

export interface ServiceDashboardProps {
  service: Service;
}

export class ServiceDashboard extends Construct {
  public readonly dashboard: Dashboard;

  constructor(
    scope: Construct,
    id: string,
    { service }: ServiceDashboardProps
  ) {
    super(scope, id);

    this.dashboard = new Dashboard(this, "Dashboard", {
      dashboardName: `Service-${service.serviceName.replace(
        /[^A-Za-z0-9_-]/g,
        ""
      )}`,
      widgets: [
        [
          new GraphWidget({
            title: `Health of the Orchestrator's Lambda Function`,
            left: [
              service.system.workflows.orchestrator.metricInvocations(),
              service.system.workflows.orchestrator.metricErrors(),
              service.system.workflows.orchestrator.metricThrottles(),
            ],
            right: [service.system.workflows.orchestrator.metricDuration()],
            width: 12,
          }),
          new GraphWidget({
            title: `How well the Orchestrator FIFO Queue is keeping up`,
            left: [
              service.system.workflows.queue.metricApproximateAgeOfOldestMessage(
                {
                  label:
                    "Approximate age of oldest message in the Orchestrator's SQS FIFO Queue",
                }
              ),
              new MathExpression({
                expression: "age / 1000",
                usingMetrics: {
                  age: service.metricMaxTaskAge(),
                },
                label:
                  "Average age of the oldest Task in a single SQS batch to the Orchestrator",
              }),
              new MathExpression({
                expression: "max_age / 1000",
                usingMetrics: {
                  max_age: service.metricMaxTaskAge({
                    statistic: Statistic.MAXIMUM,
                  }),
                },
                label: "Maximum age of any Task processed by the Orchestrator",
              }),
            ],
            width: 12,
          }),
        ],
        [
          new GraphWidget({
            title: `Size and timing impact of the History S3 Object on the Orchestrator`,
            left: [
              service.system.workflows.orchestrator.metricDuration({
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
          new GraphWidget({
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

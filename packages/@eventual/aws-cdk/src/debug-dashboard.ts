import { ActivityMetrics, OrchestratorMetrics } from "@eventual/runtime-core";
import { Dashboard, LogQueryWidget } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { Service } from "./service";

export interface DebugDashboardProps {
  service: Service;
}

/**
 * Detailed dashboard for debug purposes.
 */
export class DebugDashboard extends Construct {
  public readonly dashboard: Dashboard;

  constructor(scope: Construct, id: string, { service }: DebugDashboardProps) {
    super(scope, id);

    const logSummaryBucketDuration = "10m";

    const allLogGroups = [
      service.logging.logGroup.logGroupName,
      service.workflows.orchestrator.logGroup.logGroupName,
      service.activities.worker.logGroup.logGroupName,
      ...service.api.handlers.map((api) => api.logGroup.logGroupName),
      service.events.handler.logGroup.logGroupName,
      service.scheduler.handler.logGroup.logGroupName,
      service.scheduler.forwarder.logGroup.logGroupName,
    ];

    this.dashboard = new Dashboard(this, "Dashboard", {
      dashboardName: `Service-${service.serviceName.replace(
        /[^A-Za-z0-9_-]/g,
        ""
      )}-debug`,
      widgets: [
        [
          new LogQueryWidget({
            title: "All Errors",
            logGroupNames: allLogGroups,
            queryLines: [
              `fields @timestamp, @log, @message`,
              `filter @message like /ERROR/`,
              `sort @timestamp desc`,
            ],
            width: 24,
            height: 6,
          }),
        ],
        [
          new LogQueryWidget({
            title: "Orchestrator Summary",
            logGroupNames: [
              service.workflows.orchestrator.logGroup.logGroupName,
            ],
            queryLines: [
              "fields @duration",
              `filter @type="REPORT" OR ${OrchestratorMetrics.LoadHistoryDuration} > 0`,
              `sort @timestamp desc`,
              `stats avg(@duration) as duration, avg(@initDuration) as coldDuration, avg(@maxMemoryUsed) / 1024 as memKB, avg(${OrchestratorMetrics.LoadHistoryDuration}) as historyLoad, avg(${OrchestratorMetrics.SaveHistoryDuration}) as historySave by bin(${logSummaryBucketDuration})`,
            ],
            width: 12,
            height: 6,
          }),
          new LogQueryWidget({
            title: "Activity Worker Summary",
            logGroupNames: [service.activities.worker.logGroup.logGroupName],
            queryLines: [
              "fields @duration",
              `filter @type="REPORT" OR ${ActivityMetrics.OperationDuration} > 0`,
              `sort @timestamp desc`,
              `stats avg(@duration) as duration, avg(@initDuration) as coldDuration, avg(@maxMemoryUsed) / 1024 as memKB, avg(${ActivityMetrics.OperationDuration}) as operationDuration by bin(${logSummaryBucketDuration})`,
            ],
            width: 12,
            height: 6,
          }),
          new LogQueryWidget({
            title: "API Handlers Summary",
            logGroupNames: service.api.handlers.map(
              (api) => api.logGroup.logGroupName
            ),
            queryLines: [
              "fields @duration",
              `filter @type="REPORT"`,
              `sort @timestamp desc`,
              // group by log name as well
              `stats avg(@duration) as duration, avg(@initDuration) as coldDuration, avg(@maxMemoryUsed) / 1024 as memKB by bin(${logSummaryBucketDuration}), @log`,
            ],
            width: 12,
            height: 6,
          }),
          new LogQueryWidget({
            title: "Event Handler Summary",
            logGroupNames: [service.events.handler.logGroup.logGroupName],
            queryLines: [
              "fields @duration",
              `filter @type="REPORT"`,
              `sort @timestamp desc`,
              // group by log name as well
              `stats avg(@duration) as duration, avg(@initDuration) as coldDuration, avg(@maxMemoryUsed) / 1024 as memKB by bin(${logSummaryBucketDuration})`,
            ],
            width: 12,
            height: 6,
          }),
        ],
      ],
    });
  }
}

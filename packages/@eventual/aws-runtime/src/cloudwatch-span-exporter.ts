import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const client = new CloudWatchLogsClient({});
export class CloudWatchSpanExporter implements SpanExporter {
  private exportsInProgress: Map<Symbol, Promise<void>> = new Map();

  constructor(
    private readonly logGroupName: string,
    private readonly logStreamName: string
  ) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    console.log("Exporting!!!", spans);
    const sym = Symbol();
    const promise = client
      .send(
        new PutLogEventsCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
          logEvents: spans.map((s) => ({
            message: this.serializeSpan(s),
            timestamp: new Date().getTime(),
          })),
        })
      )
      .then(() => {
        resultCallback({ code: ExportResultCode.SUCCESS });
        this.exportsInProgress.delete(sym);
      })
      .catch((e) => {
        resultCallback({ code: ExportResultCode.FAILED, error: e });
        this.exportsInProgress.delete(sym);
      });
    this.exportsInProgress.set(sym, promise);
  }

  serializeSpan(span: ReadableSpan): string {
    return JSON.stringify({
      ...span,
      spanContext: span.spanContext(),
    });
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.exportsInProgress.values());
    this.exportsInProgress.clear();
  }
}

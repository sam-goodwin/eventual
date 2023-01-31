import {
  ActivityUpdateType,
  encodeExecutionId,
  EventualServiceClient,
  Execution,
  ExecutionHandle,
  ExecutionHistoryResponse,
  HistoryStateEvent,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  ListExecutionsRequest,
  ListExecutionsResponse,
  ListWorkflowsResponse,
  PublishEventsRequest,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
  SendSignalRequest,
  StartExecutionRequest,
  StartExecutionResponse,
  Workflow,
  WorkflowInput,
} from "@eventual/core";
import { getRequestHandler } from "./request-handler/factory.js";
import {
  BeforeRequest,
  HttpError,
  HttpRequest,
  RequestHandler,
} from "./request-handler/request-handler.js";

export interface HttpServiceClientProps {
  /**
   * Https URL provided by the eventual service on deployment.
   */
  serviceUrl: string;
  /**
   * Optional hook which allows the mutation of a request before being sent.
   *
   * Can be used to provide authorization, common headers, or signing requests.
   */
  beforeRequest?: BeforeRequest;
}

/**
 * Http implementation of the {@link EventualServiceClient} to hit the API deployed
 * with an eventual service.
 *
 * Makes unauthenticated and unsigned requests using fetch to the http endpoint.
 *
 * To authorize and/or sign requests, use the beforeRequest hook or
 * an existing platform specific client. (ex: {@link AwsHttpServiceClient} in @eventual/aws-client)
 */
export class HttpServiceClient implements EventualServiceClient {
  private readonly baseUrl: URL;
  private requestHandler: RequestHandler;

  constructor(props: HttpServiceClientProps) {
    this.baseUrl = new URL(props.serviceUrl);
    this.requestHandler = getRequestHandler();
  }

  /**
   * Pass through any http request to the eventual endpoint.
   *
   * Does not inject the _eventual suffix into the url. ([serviceUrl]/[path]).
   */
  public async proxy(request: Omit<HttpRequest, "url"> & { path: string }) {
    return this.requestHandler.request({
      ...request,
      url: `${this.baseUrl.href}/${request.path}`,
    });
  }

  public async listWorkflows(): Promise<ListWorkflowsResponse> {
    const workflowNames = await this.request<void, string[]>({
      method: "GET",
      path: "workflows",
    });

    return { workflows: workflowNames.map((n) => ({ name: n })) };
  }

  public async startExecution<W extends Workflow<any, any>>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    const workflow =
      typeof request.workflow === "string"
        ? request.workflow
        : request.workflow.workflowName;

    const { executionId } = await this.request<
      WorkflowInput<W>,
      StartExecutionResponse
    >({
      method: "POST",
      path: `workflows/${workflow}/executions`,
      body: request.input,
      query: {
        timeout: request.timeout?.dur,
        timeoutUnit: request.timeout?.unit,
        executionName: request.executionName,
      },
    });

    return new ExecutionHandle(executionId, this);
  }

  public async listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    return this.request<void, ListExecutionsResponse>({
      method: "GET",
      path: `executions`,
      query: {
        maxResults: request.maxResults,
        nextToken: request.nextToken,
        sortDirection: request.sortDirection,
        statuses: request.statuses,
        workflow: request.workflowName,
      },
    });
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    try {
      return this.request<void, Execution>({
        method: "GET",
        path: `executions/${encodeExecutionId(executionId)}`,
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return undefined;
      }
      throw err;
    }
  }

  public async getExecutionHistory(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    return this.request<void, ListExecutionEventsResponse>({
      method: "GET",
      path: `executions/${encodeExecutionId(request.executionId)}/history`,
      query: {
        maxResults: request.maxResults,
        nextToken: request.nextToken,
        sortDirection: request.sortDirection,
        after: request.after,
      },
    });
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    const resp = await this.request<void, HistoryStateEvent[]>({
      method: "GET",
      path: `executions/${encodeExecutionId(executionId)}}/workflow-history`,
    });

    return { events: resp };
  }

  public async sendSignal(request: SendSignalRequest<any>): Promise<void> {
    const { execution, signal, ...rest } = request;
    const executionId =
      typeof execution === "string" ? execution : execution.executionId;
    const signalId = typeof signal === "string" ? signal : signal.id;
    return this.request<Omit<SendSignalRequest, "execution">, void>({
      method: "PUT",
      path: `executions/${encodeExecutionId(executionId)}}/signals`,
      body: {
        ...rest,
        signal: signalId,
      },
    });
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.request<PublishEventsRequest, void>({
      method: "PUT",
      path: `events`,
      body: request,
    });
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    return this.request<SendActivitySuccessRequest, void>({
      method: "POST",
      path: `activities`,
      body: { ...request, type: ActivityUpdateType.Success },
    });
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    return this.request<SendActivityFailureRequest, void>({
      method: "POST",
      path: `activities`,
      body: { ...request, type: ActivityUpdateType.Failure },
    });
  }

  public sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    return this.request<
      SendActivityHeartbeatRequest,
      SendActivityHeartbeatResponse
    >({
      method: "POST",
      path: `activities`,
      body: { ...request, type: ActivityUpdateType.Heartbeat },
    });
  }

  private async request<Body = any, Resp = any>(
    request: Omit<HttpRequest<Body>, "url"> & {
      path: string;
      query?: Record<string, undefined | string | number | (string | number)[]>;
    }
  ): Promise<Resp> {
    const url = new URL(
      `${this.baseUrl.href}/_eventual/${request.path}${
        request.query ? `?${formatQueryString(request.query)}` : ""
      }`
    );
    return this.requestHandler.request({
      ...request,
      url: url.href,
      headers: {},
      method: request.method,
    });
  }
}

/**
 * Formats a query string, filtering undefined values and empty arrays.
 *
 * name=value&name2=value2
 */
function formatQueryString(
  entries: Record<string, undefined | string | number | (string | number)[]>
) {
  return Object.entries(entries)
    .filter(
      (e): e is [string, string | number | (string | number)[]] =>
        e[1] !== undefined && (!Array.isArray(e[1]) || e[1].length > 0)
    )
    .map(
      ([name, value]) =>
        `${name}=${
          Array.isArray(value)
            ? value.map((v) => encodeURIComponent(v.toString())).join(",")
            : encodeURIComponent(value.toString())
        }`
    )
    .join("&");
}

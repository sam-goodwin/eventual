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
  RawHttpRequestInit,
  HttpMethod,
  RawHttpRequest,
} from "@eventual/core";
import { getRequestHandler } from "./request-handler/factory.js";
import {
  BeforeRequest,
  HttpError,
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
    this.requestHandler = getRequestHandler(props.beforeRequest);
  }

  /**
   * Pass through any http request to the eventual endpoint.
   *
   * Does not inject the _eventual suffix into the url. ([serviceUrl]/[path]).
   */
  public async proxy(
    request: Omit<RawHttpRequestInit, "params"> & { path: string }
  ) {
    return this.requestHandler.request(
      new RawHttpRequest(`${this.baseUrl.href}/${request.path}`, request)
    );
  }

  public async listWorkflows(): Promise<ListWorkflowsResponse> {
    const workflowNames = await this.request<void, string[]>({
      method: HttpMethod.GET,
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
      method: HttpMethod.POST,
      path: `workflows/${workflow}/executions?${formatQueryString({
        timeout: request.timeout?.dur,
        timeoutUnit: request.timeout?.unit,
        executionName: request.executionName,
      })}`,
      body: request.input,
    });

    return new ExecutionHandle(executionId, this);
  }

  public async listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    return this.request<void, ListExecutionsResponse>({
      method: HttpMethod.GET,
      path: `executions?${formatQueryString({
        maxResults: request.maxResults,
        nextToken: request.nextToken,
        sortDirection: request.sortDirection,
        statuses: request.statuses,
        workflow: request.workflowName,
      })}`,
    });
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    try {
      return this.request<void, Execution>({
        method: HttpMethod.GET,
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
      method: HttpMethod.GET,
      path: `executions/${encodeExecutionId(
        request.executionId
      )}/history?${formatQueryString({
        maxResults: request.maxResults,
        nextToken: request.nextToken,
        sortDirection: request.sortDirection,
        after: request.after,
      })}`,
    });
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    const resp = await this.request<void, HistoryStateEvent[]>({
      method: HttpMethod.GET,
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
      method: HttpMethod.PUT,
      path: `executions/${encodeExecutionId(executionId)}}/signals`,
      body: {
        ...rest,
        signal: signalId,
      },
    });
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.request<PublishEventsRequest, void>({
      method: HttpMethod.PUT,
      path: `events`,
      body: request,
    });
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    return this.request<SendActivitySuccessRequest, void>({
      method: HttpMethod.POST,
      path: `activities`,
      body: { ...request, type: ActivityUpdateType.Success },
    });
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    return this.request<SendActivityFailureRequest, void>({
      method: HttpMethod.POST,
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
      method: HttpMethod.POST,
      path: `activities`,
      body: { ...request, type: ActivityUpdateType.Heartbeat },
    });
  }

  private async request<Body = any, Resp = any>(request: {
    body?: Body;
    method: HttpMethod;
    path: string;
  }): Promise<Resp> {
    const url = `${this.baseUrl.href}_eventual/${request.path}`;
    return this.requestHandler.request(
      new RawHttpRequest(url, {
        body: request.body ? JSON.stringify(request.body) : undefined,
        headers: { "Content-Type": "application/json" },
        method: request.method,
      })
    );
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

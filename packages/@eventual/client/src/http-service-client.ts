import {
  SendActivitySuccessRequest,
  encodeExecutionId,
  EventualServiceClient,
  Execution,
  ExecutionEventsRequest,
  ExecutionEventsResponse,
  ExecutionHandle,
  ExecutionHistoryResponse,
  SendActivityFailureRequest,
  GetExecutionsRequest,
  GetExecutionsResponse,
  GetWorkflowResponse,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  HistoryStateEvent,
  PublishEventsRequest,
  SendSignalRequest,
  StartExecutionRequest,
  Workflow,
  WorkflowEvent,
  WorkflowInput,
  ActivityUpdateType,
} from "@eventual/core";
import path from "path";
import "./fetch-polyfill.js";

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

export interface BeforeRequest {
  (request: Request): Promise<Request>;
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
  private readonly baseUrl: string;

  constructor(private props: HttpServiceClientProps) {
    this.baseUrl = path.join(props.serviceUrl, "_eventual");
  }

  public async getWorkflows(): Promise<GetWorkflowResponse> {
    const workflowNames = await this.request<void, string[]>(
      "GET",
      "workflows"
    );

    return { workflows: workflowNames.map((n) => ({ name: n })) };
  }

  public async startExecution<W extends Workflow<any, any>>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    const workflow =
      typeof request.workflow === "string"
        ? request.workflow
        : request.workflow.workflowName;

    // TODO support timeout and execution name via api

    const { executionId } = await this.request<
      WorkflowInput<W>,
      { executionId: string }
    >("POST", `workflows/${workflow}/executions`, request.input);

    return new ExecutionHandle(executionId, this);
  }

  public async getExecutions(
    request: GetExecutionsRequest
  ): Promise<GetExecutionsResponse> {
    // TODO support status filtering
    // TODO Switch the API to focus on executions, accept workflow, statuses, etc as params
    // TODO don't return an array from the API
    // TODO support pagination
    const response = await this.request<void, Execution[]>(
      "GET",
      request.workflowName
        ? `executions?workflow=${request.workflowName}`
        : "executions"
    );

    return {
      executions: response,
    };
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    try {
      return await this.request<void, Execution>(
        "GET",
        `executions/${encodeExecutionId(executionId)}`
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return undefined;
      }
      throw err;
    }
  }

  public async getExecutionHistory(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse> {
    // TODO: support pagination
    const resp = await this.request<void, WorkflowEvent[]>(
      "GET",
      `executions/${encodeExecutionId(request.executionId)}/history`
    );

    return { events: resp };
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    // TODO: support pagination
    const resp = await this.request<void, HistoryStateEvent[]>(
      "GET",
      `executions/${encodeExecutionId(executionId)}}/workflow-history`
    );

    return { events: resp };
  }

  public async sendSignal(request: SendSignalRequest<any>): Promise<void> {
    const { execution, signal, ...rest } = request;
    const executionId =
      typeof execution === "string" ? execution : execution.executionId;
    const signalId = typeof signal === "string" ? signal : signal.id;
    return await this.request<Omit<SendSignalRequest, "execution">, void>(
      "PUT",
      `executions/${encodeExecutionId(executionId)}}/signals`,
      {
        ...rest,
        signal: signalId,
      }
    );
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.request<PublishEventsRequest, void>("PUT", `events`, request);
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    return this.request<SendActivitySuccessRequest, void>(
      "POST",
      `activities`,
      { ...request, type: ActivityUpdateType.Success }
    );
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    return this.request<SendActivityFailureRequest, void>(
      "POST",
      `activities`,
      { ...request, type: ActivityUpdateType.Failure }
    );
  }

  public sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    return this.request<
      SendActivityHeartbeatRequest,
      SendActivityHeartbeatResponse
    >("POST", `activities`, { ...request, type: ActivityUpdateType.Heartbeat });
  }

  private async request<Body = any, Resp = any>(
    method: "POST" | "GET" | "PUT",
    suffix: string,
    body?: Body
  ) {
    const initRequest = new Request(new URL(path.join(this.baseUrl, suffix)), {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const request = this.props.beforeRequest
      ? await this.props.beforeRequest(initRequest)
      : initRequest;

    const resp = await fetch(request);

    if (resp.ok) {
      return resp.json() as Resp;
    } else {
      throw new HttpError(
        resp.status,
        resp.statusText,
        resp.body ? await resp.text() : undefined
      );
    }
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: string
  ) {
    super(body || statusText);
  }
}
import {
  CompleteActivityRequest,
  encodeExecutionId,
  EventualServiceClient,
  Execution,
  ExecutionEventsRequest,
  ExecutionEventsResponse,
  ExecutionHandle,
  ExecutionHistoryResponse,
  FailActivityRequest,
  GetExecutionsRequest,
  GetExecutionsResponse,
  GetWorkflowResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  HistoryStateEvent,
  PublishEventsRequest,
  SendSignalRequest,
  StartExecutionRequest,
  Workflow,
  WorkflowEvent,
  WorkflowInput,
} from "@eventual/core";
import path from "path";
import "./fetch-polyfill.js";

export interface HttpServiceClientProps {
  serviceUrl: string;
  beforeRequest?: BeforeRequest;
}

export interface BeforeRequest {
  (request: Request): Promise<Request>;
}

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

  public async getExecutionEvents(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse> {
    // TODO: support pagination
    const resp = await this.request<void, WorkflowEvent[]>(
      "GET",
      `executions/${encodeExecutionId(request.executionId)}/events`
    );

    return { events: resp };
  }

  public async getExecutionHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    // TODO: support pagination
    const resp = await this.request<void, HistoryStateEvent[]>(
      "GET",
      `executions/${encodeExecutionId(executionId)}}/history`
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

  public publishEvents(_request: PublishEventsRequest): Promise<void> {
    // TODO implement
    throw new Error("Method not implemented.");
  }

  public sendActivitySuccess(
    _request: CompleteActivityRequest<any>
  ): Promise<void> {
    // TODO implement
    throw new Error("Method not implemented.");
  }

  public sendActivityFailure(_request: FailActivityRequest): Promise<void> {
    // TODO implement
    throw new Error("Method not implemented.");
  }

  public sendActivityHeartbeat(
    _request: HeartbeatRequest
  ): Promise<HeartbeatResponse> {
    // TODO implement
    throw new Error("Method not implemented.");
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

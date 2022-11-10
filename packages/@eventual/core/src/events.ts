export interface BaseEvent {
  id: string;
  timestamp: string;
}

export type Event =
  | WorkflowStartedEvent
  | WorkflowTaskStartedEvent
  | InlineActivityScheduledEvent
  | InlineActivityCompletedEvent
  | InlineActivityFailedEvent
  | ActivityScheduledEvent
  | ActivityCompletedEvent
  | ActivityFailedEvent
  | WorkflowTaskCompletedEvent
  | WorkflowCompletedEvent;

export interface WorkflowStartedEvent extends BaseEvent {
  type: "WorkflowStartedEvent";
  input: any;
}

export interface WorkflowTaskStartedEvent extends BaseEvent {
  type: "WorkflowTaskStartedEvent";
}

export interface InlineActivityScheduledEvent extends BaseEvent {
  type: "InlineActivityScheduledEvent";
  seq: number;
}

export interface InlineActivityCompletedEvent extends BaseEvent {
  type: "InlineActivityCompletedEvent";
  seq: number;
  result: any;
}

export interface InlineActivityFailedEvent extends BaseEvent {
  type: "InlineActivityFailedEvent";
  seq: number;
  error: string;
  message: string;
}

export interface ActivityScheduledEvent extends BaseEvent {
  type: "ActivityScheduledEvent";
  seq: number;
  threadId: number;
}

export interface ActivityCompletedEvent extends BaseEvent {
  type: "ActivityCompletedEvent";
  seq: number;
  threadId: number;
  result: any;
}

export interface ActivityFailedEvent extends BaseEvent {
  type: "ActivityFailedEvent";
  seq: number;
  threadId: number;
  error: string;
  message: string;
}

export interface WorkflowTaskCompletedEvent extends BaseEvent {
  type: "WorkflowTaskCompletedEvent";
}

export interface WorkflowCompletedEvent extends BaseEvent {
  type: "WorkflowCompletedEvent";
  output: any;
}

export function assertEventType<T extends Event>(
  event: any,
  type: T["type"]
): asserts event is T {
  if (!event || event.type !== type) {
    throw new Error(`Expected event of type ${type}`);
  }
}

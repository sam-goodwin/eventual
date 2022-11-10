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
  counter: number;
}

export interface InlineActivityCompletedEvent extends BaseEvent {
  type: "InlineActivityCompletedEvent";
  counter: number;
  result: any;
}

export interface InlineActivityFailedEvent extends BaseEvent {
  type: "InlineActivityFailedEvent";
  counter: number;
  error: string;
  message: string;
}

export interface WorkflowTaskCompletedEvent extends BaseEvent {
  type: "WorkflowTaskEvent";
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

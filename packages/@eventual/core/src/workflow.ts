import { Context, WorkflowContext } from "./context.js";
import { DeterminismError } from "./error.js";
import {
  filterEvents,
  HistoryStateEvent,
  isEventualEvent,
  isSleepCompleted,
  isSleepScheduled,
  isWorkflowStarted,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
} from "./events.js";
import { EventualFunction } from "./eventual.js";
import { resetActivityCollector } from "./global.js";
import { interpret, Program, WorkflowResult } from "./interpret.js";

interface ProgressWorkflowResult extends WorkflowResult {
  history: HistoryStateEvent[];
}

/**
 * A function which starts the {@link Program} generator with input and {@link Context}.
 */
export type ProgramStarter = EventualFunction<Program<any>>;

/**
 * Progress a workflow using previous history, new events, and a program.
 */
export function progressWorkflow(
  program: ProgramStarter,
  historyEvents: HistoryStateEvent[],
  taskEvents: HistoryStateEvent[],
  workflowContext: WorkflowContext,
  executionId: string
): ProgressWorkflowResult {
  // historical events and incoming events will be fed into the workflow to resume/progress state
  const inputEvents = filterEvents<HistoryStateEvent>(
    historyEvents,
    taskEvents
  );

  // Generates events that are time sensitive, like sleep completed events.
  const syntheticEvents = generateSyntheticEvents(inputEvents);

  console.debug(JSON.stringify(historyEvents));
  console.debug(JSON.stringify(taskEvents));
  console.debug(JSON.stringify(syntheticEvents));

  const allEvents = [...inputEvents, ...syntheticEvents];

  const startEvent = inputEvents.find(isWorkflowStarted);

  if (!startEvent) {
    throw new DeterminismError(
      `No ${WorkflowEventType.WorkflowStarted} found.`
    );
  }

  const context: Context = {
    workflow: workflowContext,
    execution: {
      ...startEvent.context,
      id: executionId,
      startTime: startEvent.timestamp,
    },
  };

  // execute workflow
  const interpretEvents = allEvents.filter(isEventualEvent);

  console.debug(JSON.stringify(interpretEvents));

  try {
    return {
      ...interpret(program(startEvent.input, context), interpretEvents),
      history: allEvents,
    };
  } catch (err) {
    // temporary fix when the interpreter fails, but the activities are not cleared.
    resetActivityCollector();
    throw err;
  }
}

/**
 * Generates synthetic events, for example, {@link SleepCompleted} events when the time has passed, but a real completed event has not come in yet.
 */
export function generateSyntheticEvents(
  events: HistoryStateEvent[]
): SleepCompleted[] {
  const unresolvedSleep: Record<number, SleepScheduled> = {};
  const now = new Date();

  const sleepEvents = events.filter(
    (event): event is SleepScheduled | SleepCompleted =>
      isSleepScheduled(event) || isSleepCompleted(event)
  );

  for (const event of sleepEvents) {
    if (isSleepScheduled(event)) {
      unresolvedSleep[event.seq] = event;
    } else {
      delete unresolvedSleep[event.seq];
    }
  }

  const syntheticSleepComplete: SleepCompleted[] = Object.values(
    unresolvedSleep
  )
    .filter((event) => new Date(event.untilTime).getTime() <= now.getTime())
    .map((e) => ({
      type: WorkflowEventType.SleepCompleted,
      seq: e.seq,
      timestamp: now.toISOString(),
    } satisfies SleepCompleted));

  return syntheticSleepComplete;
}

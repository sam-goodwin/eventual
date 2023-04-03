import {
  dictionaryStreamMatchesItem,
  HttpRequest,
  HttpResponse,
  isDictionaryStreamItem,
} from "@eventual/core";
import { dictionaries, registerServiceClient } from "@eventual/core/internal";
import { isActivityWorkerRequest } from "../clients/activity-client.js";
import { RuntimeServiceClient } from "../clients/runtime-service-clients.js";
import { isTimerRequest } from "../clients/timer-client.js";
import { isActivitySendEventRequest } from "../handlers/activity-fallback-handler.js";
import { isWorkflowTask } from "../tasks.js";
import {
  LocalContainer,
  LocalEnvConnector,
  LocalEvent,
} from "./local-container.js";
import { TimeController } from "./time-controller.js";

export class LocalEnvironment {
  private timeController: TimeController<LocalEvent>;
  private localConnector: LocalEnvConnector;
  private running: boolean = false;
  private localContainer: LocalContainer;

  constructor() {
    this.timeController = new TimeController([], {
      increment: 1,
      start: new Date().getTime(),
    });
    this.localConnector = {
      getTime: () => new Date(),
      // local env doesn't care about current vs next tick
      pushWorkflowTaskNextTick: (task) => {
        this.timeController.addEvent(new Date().getTime(), task);
        this.tryStartProcessingEvents();
      },
      pushWorkflowTask: (task) => {
        this.timeController.addEvent(new Date().getTime(), task);
        this.tryStartProcessingEvents();
      },
      scheduleEvent: (time, task) => {
        this.timeController.addEvent(time.getTime(), task);
        this.tryStartProcessingEvents();
      },
    };
    this.localContainer = new LocalContainer(this.localConnector, {
      serviceName: "fixme",
    });

    const serviceClient = new RuntimeServiceClient({
      activityClient: this.localContainer.activityClient,
      eventClient: this.localContainer.eventClient,
      executionHistoryStateStore:
        this.localContainer.executionHistoryStateStore,
      executionHistoryStore: this.localContainer.executionHistoryStore,
      executionQueueClient: this.localContainer.executionQueueClient,
      executionStore: this.localContainer.executionStore,
      workflowClient: this.localContainer.workflowClient,
      workflowProvider: this.localContainer.workflowProvider,
      transactionClient: this.localContainer.transactionClient,
    });

    registerServiceClient(serviceClient);

    this.start();
  }

  private start() {
    this.running = true;
    this.tryStartProcessingEvents();
  }

  private nextEvents?: {
    next: number;
    timer: NodeJS.Timeout;
  };

  /**
   * Checks to see if there are future events to process
   * and starts a timer for that time if there is not
   * already a sooner timer.
   *
   * When the timer goes off, events are processed until exhausted.
   */
  private async tryStartProcessingEvents() {
    const next = this.timeController.nextEventTick;
    // if there is a next event and there is not a sooner timer in progress.
    if (next && (!this.nextEvents || this.nextEvents.next > next)) {
      // if there already is a timer, clear it.
      if (this.nextEvents) {
        clearTimeout(this.nextEvents.timer);
      }
      this.nextEvents = {
        next,
        timer: setTimeout(async () => {
          // when the timer goes off, make sure the environment is still running
          // and that there is not a newer timer registered.
          if (this.nextEvents?.next === next && this.running) {
            await this.processEvents();
            // when events are processed, if there is not a newer timer
            // and the env is still running, try to register the next timer.
            if (this.nextEvents.next === next && this.running) {
              this.nextEvents = undefined;
              this.tryStartProcessingEvents();
            }
          }
        }, next - new Date().getTime()),
      };
    }
  }

  private async processEvents() {
    let events: LocalEvent[] = [];
    // run until there are no new events up until the current time
    // it is possible that new events have been added in the past
    // since starting processing.
    while (
      (events = this.timeController.tickUntil(new Date().getTime())).length > 0
    ) {
      const timerRequests = events.filter(isTimerRequest);
      const workflowTasks = events.filter(isWorkflowTask);
      const activityWorkerRequests = events.filter(isActivityWorkerRequest);
      const dictionaryStreamItems = events.filter(isDictionaryStreamItem);

      // run all activity requests, don't wait for a result
      activityWorkerRequests.forEach(async (request) => {
        const result = await this.localContainer.activityWorker(request);
        if (!!result && isActivitySendEventRequest(result)) {
          this.localConnector.pushWorkflowTaskNextTick({
            events: [result.event],
            executionId: result.executionId,
          });
        }
      });
      // run all timer requests, don't wait for a result
      timerRequests.forEach((request) =>
        this.localContainer.timerHandler(request)
      );
      // for each dictionary stream item, find the streams that match it, and run the worker with the item
      dictionaryStreamItems.forEach((i) => {
        const streamNames = [...dictionaries().values()]
          .flatMap((d) => d.streams)
          .filter((s) => dictionaryStreamMatchesItem(i, s))
          .map((s) => s.name);
        streamNames.forEach((streamName) => {
          this.localContainer.dictionaryStreamWorker({
            ...i,
            streamName,
          });
        });
      });

      // run the orchestrator, but wait for a result.
      await this.localContainer.orchestrator(workflowTasks);
    }
  }

  public stop() {
    this.running = false;
  }

  public async invokeCommandOrApi(
    httpRequest: HttpRequest
  ): Promise<HttpResponse> {
    return this.localContainer.commandWorker(httpRequest);
  }
}

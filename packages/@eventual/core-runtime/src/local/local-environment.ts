import {
  EventualServiceClient,
  HttpRequest,
  HttpResponse,
} from "@eventual/core";
import { registerServiceClient } from "@eventual/core/internal";
import { isTimerRequest, TimerRequest } from "../clients/timer-client.js";
import {
  ActivityWorkerRequest,
  isActivitySendEventRequest,
  isActivityWorkerRequest,
} from "../index.js";
import { isWorkflowTask, WorkflowTask } from "../tasks.js";
import { LocalContainer, LocalEnvConnector } from "./local-container.js";
import { TimeController } from "./time-controller.js";

export class LocalEnvironment {
  private timeController: TimeController<
    WorkflowTask | TimerRequest | ActivityWorkerRequest
  >;
  private localConnector: LocalEnvConnector;
  private running: boolean = false;
  private localContainer: LocalContainer;

  constructor(serviceClient: EventualServiceClient) {
    this.timeController = new TimeController([], {
      increment: 1,
      start: new Date().getTime(),
    });
    this.localConnector = {
      getTime: () => new Date(),
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
    let events: (WorkflowTask | TimerRequest | ActivityWorkerRequest)[] = [];
    // run until there are no new events up until the current time
    // it is possible that new events have been added in the past
    // since starting processing.
    while (
      (events = this.timeController.tickUntil(new Date().getTime())).length > 0
    ) {
      const timerRequests = events.filter(isTimerRequest);
      const workflowTasks = events.filter(isWorkflowTask);
      const activityWorkerRequests = events.filter(isActivityWorkerRequest);

      // run all activity requests, don't wait for a result
      activityWorkerRequests.forEach(async (request) => {
        const result = await this.localContainer.activityWorker(request);
        if (!!result && isActivitySendEventRequest(result)) {
          this.localConnector.pushWorkflowTask({
            events: [result.event],
            executionId: result.executionId,
          });
        }
      });
      // run all timer requests, don't wait for a result
      timerRequests.forEach((request) =>
        this.localContainer.timerHandler(request)
      );

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

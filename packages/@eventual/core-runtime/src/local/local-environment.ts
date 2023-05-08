import { HttpRequest, HttpResponse } from "@eventual/core";
import {
  buckets,
  entities,
  EnvironmentManifest,
  registerEnvironmentManifest,
  registerServiceClient,
} from "@eventual/core/internal";
import { RuntimeServiceClient } from "../clients/runtime-service-clients.js";
import { isTaskWorkerRequest } from "../clients/task-client.js";
import { isTimerRequest } from "../clients/timer-client.js";
import { isTaskSendEventRequest } from "../handlers/task-fallback-handler.js";
import { isWorkflowTask } from "../tasks.js";
import {
  bucketHandlerMatchesEvent,
  entityStreamMatchesItem,
  isBucketNotificationEvent,
  isEntityStreamItem,
} from "../utils.js";
import {
  LocalContainer,
  LocalEnvConnector,
  LocalEvent,
} from "./local-container.js";
import { TimeController } from "./time-controller.js";

export class LocalEnvironment {
  private timeController: TimeController<LocalEvent>;
  private localConnector: LocalEnvConnector;
  private running = false;
  private localContainer: LocalContainer;

  constructor(private environmentManifest: EnvironmentManifest) {
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
      serviceName: environmentManifest.serviceName,
      serviceUrl: environmentManifest.serviceUrl,
    });

    const serviceClient = new RuntimeServiceClient({
      taskClient: this.localContainer.taskClient,
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
    registerEnvironmentManifest(environmentManifest);

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
      const taskWorkerRequests = events.filter(isTaskWorkerRequest);
      const entityStreamItems = events.filter(isEntityStreamItem);
      const bucketNotificationEvents = events.filter(isBucketNotificationEvent);

      // run all task requests, don't wait for a result
      taskWorkerRequests.forEach(async (request) => {
        const result = await this.localContainer.taskWorker(request);
        if (!!result && isTaskSendEventRequest(result)) {
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
      // for each entity stream item, find the streams that match it, and run the worker with the item
      entityStreamItems.forEach((i) => {
        const streamNames = [...entities().values()]
          .flatMap((d) => d.streams)
          .filter((s) => entityStreamMatchesItem(i, s))
          .map((s) => s.name);
        streamNames.forEach((streamName) => {
          this.localContainer.entityStreamWorker({
            ...i,
            streamName,
          });
        });
      });

      // for each bucket stream item, find the streams that match it, and run the worker with the item
      bucketNotificationEvents.forEach((i) => {
        const streamNames = [...buckets().values()]
          .flatMap((d) => d.handlers)
          .filter((s) => bucketHandlerMatchesEvent(i, s))
          .map((s) => s.name);
        streamNames.forEach((streamName) => {
          this.localContainer.bucketHandlerWorker({
            ...i,
            handlerName: streamName,
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
    return this.localContainer.commandWorker(httpRequest, {
      service: {
        serviceUrl: this.environmentManifest.serviceUrl,
        serviceName: this.environmentManifest.serviceName,
      },
    });
  }
}

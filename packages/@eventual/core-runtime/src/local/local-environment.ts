import type {
  EntityStreamItem,
  GetBucketMetadataResponse,
  GetBucketObjectOptions,
  GetBucketObjectResponse,
  HttpRequest,
  HttpResponse,
  PresignedUrlOperation,
  PutBucketObjectResponse,
  PutBucketOptions,
  SocketConnectRequest,
  SocketDisconnectRequest,
  SocketMessageRequest,
  SocketResponse,
} from "@eventual/core";
import {
  assertNever,
  getEventualResources,
  type ServiceSpec,
} from "@eventual/core/internal";
import type { Readable } from "stream";
import { ulid } from "ulidx";
import { isTaskWorkerRequest } from "../clients/task-client.js";
import { isTimerRequest } from "../clients/timer-client.js";
import { isTaskSendEventRequest } from "../handlers/task-fallback-handler.js";
import { isWorkflowTask } from "../tasks.js";
import {
  bucketHandlerMatchesEvent,
  entityStreamMatchesItem,
  isBucketNotificationEvent,
} from "../utils.js";
import {
  LocalContainer,
  isLocalEmittedEvents,
  isLocalEntityStreamEvent,
  isLocalQueuePollEvent,
  type LocalEnvConnector,
  type LocalEvent,
} from "./local-container.js";
import type { PersistanceStore } from "./local-persistance-store.js";
import { TimeController } from "./time-controller.js";
import { WebSocketContainer } from "./web-socket-container.js";

export interface EnvironmentManifest {
  serviceName: string;
  serviceSpec: ServiceSpec;
  serviceUrl: string;
}

export class LocalEnvironment {
  private timeController: TimeController<LocalEvent>;
  private localConnector: LocalEnvConnector;
  private running = false;
  private localContainer: LocalContainer;

  constructor(
    private environmentManifest: EnvironmentManifest,
    webSocketContainer: WebSocketContainer,
    private persistanceStore: PersistanceStore
  ) {
    this.timeController = this.persistanceStore.register("time", (data) =>
      data
        ? TimeController.fromSerializedData(data)
        : new TimeController([], {
            increment: 1,
            start: new Date().getTime(),
          })
    );
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
      localPersistanceStore: this.persistanceStore,
      serviceName: environmentManifest.serviceName,
      serviceUrl: environmentManifest.serviceUrl,
      webSocketContainer,
    });

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
      const entityStreamItems = events.filter(isLocalEntityStreamEvent);
      const bucketNotificationEvents = events.filter(isBucketNotificationEvent);
      const localEmittedEvents = events.filter(isLocalEmittedEvents);
      const localQueuePollEvents = events.filter(isLocalQueuePollEvent);

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
        const item = {
          id: ulid(),
          ...i.item,
        } as EntityStreamItem;
        const entity = this.localContainer.entityProvider.getEntity(
          i.entityName
        );

        if (entity) {
          entity.streams
            .filter((s) => entityStreamMatchesItem(entity, item, s))
            .forEach((stream) => {
              this.localContainer.entityStreamWorker(
                i.entityName,
                stream.name,
                [item]
              );
            });
        }
      });

      // for each bucket stream item, find the streams that match it, and run the worker with the item
      bucketNotificationEvents.forEach((i) => {
        const streamNames = [...getEventualResources("Bucket").values()]
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

      // send all of the events to the subscription worker
      localEmittedEvents.forEach((e) => {
        this.localContainer.subscriptionWorker(e.events);
      });

      // run the orchestrator, but wait for a result.
      await this.localContainer.orchestrator(workflowTasks);

      // check to see if any queues have messages to process
      const queuesToPoll = Array.from(
        new Set(localQueuePollEvents.map((s) => s.queueName))
      );
      queuesToPoll.forEach(async (queueName) => {
        const messages =
          this.localContainer.queueClient.receiveMessages(queueName);
        const result = await this.localContainer.queueHandlerWorker(
          queueName,
          messages
        );

        const messagesToDelete = result
          ? messages.filter((m) => result.failedMessageIds.includes(m.id))
          : messages;

        // when a queue message is handled without error, delete it.
        messagesToDelete.forEach((m) =>
          this.localContainer.queueClient.deleteMessage(
            queueName,
            m.receiptHandle
          )
        );
      });
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

  public async sendSocketRequest(
    socketName: string,
    request:
      | SocketDisconnectRequest
      | SocketMessageRequest
      | SocketConnectRequest
  ): Promise<SocketResponse | void> {
    return this.localContainer.socketWorker(socketName, request);
  }

  public async executePresignedUrl<Op extends PresignedUrlOperation>(
    token: string,
    operation: Op,
    options?: Op extends "get"
      ? GetBucketObjectOptions
      : Op extends "put"
      ? PutBucketOptions
      : Op extends "delete"
      ? undefined
      : Op extends "head"
      ? GetBucketObjectOptions
      : never,
    content?: string | Buffer | Readable
  ): Promise<PresignedUrlResponse<Op>> {
    const data = this.localContainer.bucketStore.decodeAsyncUrlKey(
      token,
      operation
    );
    if (
      new Date(data.expires).getTime() < this.localConnector.getTime().getTime()
    ) {
      return { expired: true };
    }
    if (operation === "get") {
      return {
        key: data.key,
        resp: (await this.localContainer.bucketStore.get(
          data.bucketName,
          data.key,
          options as GetBucketObjectOptions | undefined
        )) as any,
      };
    } else if (operation === "delete") {
      return {
        key: data.key,
        resp: (await this.localContainer.bucketStore.delete(
          data.bucketName,
          data.key
        )) as any,
      };
    } else if (operation === "head") {
      return {
        key: data.key,
        resp: (await this.localContainer.bucketStore.head(
          data.bucketName,
          data.key,
          options as GetBucketObjectOptions | undefined
        )) as any,
      };
    } else if (operation === "put") {
      if (!content) {
        throw new Error("Content is required for put operation");
      }
      return {
        key: data.key,
        resp: (await this.localContainer.bucketStore.put(
          data.bucketName,
          data.key,
          content,
          options as PutBucketOptions | undefined
        )) as any,
      };
    }
    return assertNever(operation);
  }
}

export type PresignedUrlResponse<Op extends PresignedUrlOperation> =
  | PresignedUrlSuccessResponse<Op>
  | { error: string }
  | { expired: true };

export interface PresignedUrlSuccessResponse<Op extends PresignedUrlOperation> {
  key: string;
  resp: Op extends "get"
    ? GetBucketObjectResponse | undefined
    : Op extends "put"
    ? PutBucketObjectResponse
    : Op extends "delete"
    ? void
    : Op extends "head"
    ? GetBucketMetadataResponse | undefined
    : never;
}

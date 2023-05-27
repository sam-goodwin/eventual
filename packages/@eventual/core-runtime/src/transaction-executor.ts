import {
  Entity,
  EntityReadOptions,
  EntityTransactConditionalOperation,
  EntityTransactDeleteOperation,
  EntityTransactItem,
  EntityTransactSetOperation,
  EntityWithMetadata,
  KeyMap,
  TransactionCancelled,
  TransactionConflict,
  TransactionContext,
  TransactionFunction,
  UnexpectedVersion,
} from "@eventual/core";
import {
  EmitEventsCall,
  EntityOperation,
  EventualCallHook,
  EventualPromise,
  EventualPromiseSymbol,
  Result,
  SendSignalCall,
  ServiceType,
  SignalTargetType,
  assertNever,
  isEmitEventsCall,
  isEntityCall,
  isEntityOperationOfType,
  isSendSignalCall,
  serviceTypeScope,
} from "@eventual/core/internal";
import type { EventClient } from "./clients/event-client.js";
import type { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { enterEventualCallHookScope } from "./eventual-hook.js";
import type { EntityProvider } from "./providers/entity-provider.js";
import { isResolved } from "./result.js";
import {
  EntityStore,
  NormalizedEntityCompositeKey,
  convertNormalizedEntityKeyToMap,
  normalizeCompositeKey,
} from "./stores/entity-store.js";
import { serializeCompositeKey } from "./utils.js";

/**
 * Provide a hooked and labelled promise for all of the {@link Eventual}s.
 *
 * Exposes a resolve method which accepts a {@link Result} object. Adds the seq ID to
 * allow future identification of EventualPromises.
 */
function createResolvedEventualPromise<R>(
  result: Result<R>
): EventualPromise<R> {
  const promise = (
    isResolved(result)
      ? Promise.resolve(result.value)
      : Promise.reject(result.error)
  ) as EventualPromise<R>;
  // transaction does not use seq
  promise[EventualPromiseSymbol] = 0;
  return promise;
}

function createEventualPromise<R>(
  executor: () => Promise<R> | R
): EventualPromise<R> {
  const promise = new Promise(async (resolve, reject) => {
    try {
      resolve(await executor());
    } catch (err) {
      reject(err);
    }
  }) as EventualPromise<R>;
  // transaction does not use seq
  promise[EventualPromiseSymbol] = 0;
  return promise;
}

export interface TransactionResult<R> {
  result: Result<R>;
}

export interface TransactionExecutor {
  <Input, Output>(
    transactionFunction: TransactionFunction<Input, Output>,
    input: Input,
    transactionContext: TransactionContext,
    retries?: number
  ): Promise<TransactionResult<Output>>;
}

interface TransactionFailedItem {
  entityName: string;
  key: KeyMap<any, any, any>;
}

interface TransactionEntityState {
  entityName: string;
  key: NormalizedEntityCompositeKey;
  originalVersion: number;
  currentVersion: number;
  currentValue: any | undefined;
}

export function createTransactionExecutor(
  entityStore: EntityStore,
  entityProvider: EntityProvider,
  executionQueueClient: ExecutionQueueClient,
  eventClient: EventClient
): TransactionExecutor {
  return async function <Input, Output>(
    transactionFunction: TransactionFunction<Input, Output>,
    input: Input,
    transactionContext: TransactionContext,
    retries = 3
  ) {
    try {
      // retry the transaction until it completes, there is an explicit conflict, or we run out of retries.
      do {
        const result = await executeTransactionOnce();
        if ("output" in result) {
          return { result: Result.resolved(result.output) };
        } else if (!result.canRetry) {
          break;
        }
      } while (retries--);

      return {
        result: Result.failed(new Error("Failed after too many retires.")),
      };
    } catch (err) {
      return {
        result: Result.failed(err),
      };
    }

    async function executeTransactionOnce(): Promise<
      | { output: Output }
      | {
          canRetry: boolean;
          failedItems: TransactionFailedItem[];
        }
    > {
      // a map of the keys of all mutable entity calls that have been made to the request
      const entityCalls = new Map<string, EntityOperation<"set" | "delete">>();
      // store all of the event and signal calls to execute after the transaction completes
      const eventCalls: (EmitEventsCall | SendSignalCall)[] = [];
      // a map of the keys of all get operations or mutation operations to check during the transaction.
      // also serves as a get cache when get is called multiple times on the same keys
      const retrievedEntities = new Map<string, TransactionEntityState>();

      const eventualCallHook: EventualCallHook = {
        registerEventualCall: (eventual): any => {
          if (isEntityCall(eventual)) {
            if (
              isEntityOperationOfType("set", eventual) ||
              isEntityOperationOfType("delete", eventual)
            ) {
              return createEventualPromise<
                Awaited<ReturnType<Entity["delete"] | Entity["set"]>>
              >(async () => {
                const entity = getEntity(eventual.entityName);
                // should either by the key or the value object, which can be used as the key
                const key = eventual.params[0];
                const normalizedKey = normalizeCompositeKey(entity, key);
                const entityValue = await resolveEntity(
                  entity.name,
                  normalizedKey,
                  { consistentRead: true }
                );
                const serializedKey = serializeCompositeKey(
                  entity.name,
                  normalizedKey
                );

                /**
                 * When a set or delete is performed with an explicit expected version, immediately validate that the
                 * entity resolved has that expected version.
                 *
                 * If a set or delete has already been performed, we'll replace that operation with this one
                 * so we always use the original version.
                 */
                const expectedVersion = eventual.params[1]?.expectedVersion;
                if (
                  eventual.params[1]?.expectedVersion &&
                  entityValue.originalVersion !==
                    eventual.params[1]?.expectedVersion
                ) {
                  throw new UnexpectedVersion(
                    `Operation expected version ${expectedVersion} but found ${entityValue.originalVersion}.`
                  );
                }

                entityCalls.set(serializedKey, eventual);
                if (isEntityOperationOfType("set", eventual)) {
                  const newVersion = entityValue.originalVersion + 1;
                  retrievedEntities.set(serializedKey, {
                    entityName: eventual.entityName,
                    key: normalizedKey,
                    currentValue: eventual.params[0],
                    currentVersion: newVersion,
                    originalVersion: entityValue.originalVersion,
                  });
                  return { version: newVersion };
                } else {
                  // delete - current value is undefined and current version is 0
                  retrievedEntities.set(serializedKey, {
                    entityName: eventual.entityName,
                    key: normalizedKey,
                    currentValue: undefined,
                    currentVersion: 0,
                    originalVersion: entityValue.originalVersion,
                  });
                  return undefined;
                }
              });
            } else if (
              isEntityOperationOfType("get", eventual) ||
              isEntityOperationOfType("getWithMetadata", eventual)
            ) {
              return createEventualPromise(async () => {
                const entity = getEntity(eventual.entityName);
                const [key, options] = eventual.params;
                const value = await resolveEntity(
                  entity.name,
                  normalizeCompositeKey(entity, key),
                  options
                );

                if (isEntityOperationOfType("get", eventual)) {
                  return value.currentValue;
                } else if (
                  isEntityOperationOfType("getWithMetadata", eventual)
                ) {
                  return value.currentValue !== undefined
                    ? ({
                        value: value.currentValue,
                        version: value.currentVersion,
                      } satisfies EntityWithMetadata)
                    : undefined;
                }
                return assertNever(eventual);
              });
            }
          } else if (isEmitEventsCall(eventual)) {
            eventCalls.push(eventual);
            return createResolvedEventualPromise(Result.resolved(undefined));
          } else if (isSendSignalCall(eventual)) {
            eventCalls.push(eventual);
            return createResolvedEventualPromise(Result.resolved(undefined));
          }
          throw new Error(
            `Unsupported eventual call type. Only Entity requests, emit events, and send signals are supported.`
          );
        },
        /**
         * Not used
         */
        resolveEventual: () => undefined,
      };

      const output = await serviceTypeScope(
        ServiceType.TransactionWorker,
        async () =>
          await enterEventualCallHookScope(
            eventualCallHook,
            async () => await transactionFunction(input, transactionContext)
          )
      );

      /**
       * Build the transaction items that contain mutations with assertions or just assertions.
       */
      const transactionItems: EntityTransactItem[] = [
        ...retrievedEntities.entries(),
      ].map(([serializedKey, { entityName, key, originalVersion }]) => {
        const call = entityCalls.get(serializedKey);

        if (call) {
          const [, options] = call.params;

          return call.operation === "set"
            ? ({
                entity: entityName,
                operation: "set",
                value: call.params[0],
                options: {
                  ...options,
                  expectedVersion: originalVersion,
                },
              } satisfies EntityTransactSetOperation)
            : ({
                entity: entityName,
                operation: "delete",
                key: call.params[0],
                options: {
                  ...options,
                  expectedVersion: originalVersion,
                },
              } satisfies EntityTransactDeleteOperation);
        } else {
          // values that are retrieved only, will be checked using a condition
          return {
            entity: entityName,
            operation: "condition",
            key: convertNormalizedEntityKeyToMap(key),
            version: originalVersion,
          } satisfies EntityTransactConditionalOperation<any>;
        }
      });

      console.log(JSON.stringify(transactionItems, undefined, 4));

      try {
        /**
         * Run the transaction
         */
        const result =
          transactionItems.length > 0
            ? await entityStore.transactWrite(transactionItems)
            : undefined;

        console.log(JSON.stringify(result, undefined, 4));
      } catch (err) {
        /**
         * If the transaction failed, check if it is retryable or not.
         */

        if (err instanceof TransactionCancelled) {
          return {
            canRetry: true,
            failedItems: err.reasons
              .map((r, i) => {
                if (r instanceof UnexpectedVersion) {
                  const x: EntityTransactItem = transactionItems[i]!;
                  const entity =
                    typeof x.entity === "string"
                      ? getEntity(x.entity)
                      : x.entity;
                  // normalize the key to extract only the key fields.
                  const key = normalizeCompositeKey(
                    entity,
                    x.operation === "set" ? x.value : x.key
                  );
                  return {
                    entityName: entity.name,
                    // convert back to a map to send to the caller
                    key: convertNormalizedEntityKeyToMap(key),
                  } satisfies TransactionFailedItem;
                }
                return undefined;
              })
              .filter((i): i is Exclude<typeof i, undefined> => !!i),
          };
        } else if (err instanceof TransactionConflict) {
          return { canRetry: true, failedItems: [] };
        } else {
          console.error(err);
          return { canRetry: false, failedItems: [] };
        }
      }

      /**
       * If the transaction succeeded, emit events and send signals.
       * TODO: move the side effects to a transactional dynamo update.
       */
      await Promise.allSettled(
        eventCalls.map(async (call) => {
          if (isEmitEventsCall(call)) {
            await eventClient.emitEvents(...call.events);
          } else if (call) {
            // shouldn't happen
            if (call.target.type === SignalTargetType.ChildExecution) {
              return;
            }
            await executionQueueClient.sendSignal({
              execution: call.target.executionId,
              signal: call.signalId,
              payload: call.payload,
              id: call.id,
            });
          }
        })
      );

      return { output };

      function getEntity(entityName: string) {
        const entity = entityProvider.getEntity(entityName);
        if (!entity) {
          throw new Error(`Entity ${entityName} was not found.`);
        }
        return entity;
      }

      function resolveEntity(
        entityName: string,
        key: NormalizedEntityCompositeKey,
        options?: EntityReadOptions
      ): EventualPromise<TransactionEntityState> {
        const serializedKey = serializeCompositeKey(entityName, key);
        if (retrievedEntities.has(serializedKey)) {
          return createResolvedEventualPromise(
            Result.resolved(retrievedEntities.get(serializedKey)!)
          );
        } else {
          return createEventualPromise(async () => {
            const value = await entityStore.getWithMetadata(
              entityName,
              convertNormalizedEntityKeyToMap(key),
              options
            );
            const entityState = {
              entityName,
              key,
              currentValue: value?.value,
              currentVersion: value?.version ?? 0,
              originalVersion: value?.version ?? 0,
            };
            retrievedEntities.set(serializedKey, entityState);
            return entityState;
          });
        }
      }
    }
  };
}

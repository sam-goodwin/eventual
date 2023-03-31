import {
  CompositeKey,
  Dictionary,
  DictionaryTransactItem,
  TransactionFunction,
} from "@eventual/core";
import {
  assertNever,
  DictionaryCall,
  DictionaryDeleteOperation,
  DictionarySetOperation,
  enterEventualCallHookScope,
  EventualCallHook,
  EventualPromise,
  EventualPromiseSymbol,
  isDictionaryCall,
  isDictionaryCallOfType,
  isPublishEventsCall,
  isSendSignalCall,
  PublishEventsCall,
  Result,
  SendSignalCall,
  ServiceType,
  serviceTypeScope,
  SignalTargetType,
} from "@eventual/core/internal";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { isResolved } from "./result.js";
import {
  DictionaryStore,
  EntityWithMetadata,
  isTransactionCancelledResult,
  isUnexpectedVersionResult,
  normalizeCompositeKey,
} from "./stores/dictionary-store.js";
import { deserializeCompositeKey, serializeCompositeKey } from "./utils.js";

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
    retries?: number
  ): Promise<TransactionResult<Output>>;
}

export function createTransactionExecutor(
  dictionaryStore: DictionaryStore,
  executionQueueClient: ExecutionQueueClient,
  eventClient: EventClient
): TransactionExecutor {
  return async function <Input, Output>(
    transactionFunction: TransactionFunction<Input, Output>,
    input: Input,
    retries = 3
  ) {
    // retry the transaction until it completes, there is an explicit conflict, or we run out of retries.
    do {
      const result = await executeTransactionOnce();
      if ("output" in result) {
        return { result: Result.resolved(result.output) };
      } else if (result.canRetry) {
        continue;
      } else {
        return {
          result: Result.failed(
            new Error("Failed after an explicit conflict.")
          ),
        };
      }
    } while (retries--);

    return {
      result: Result.failed(new Error("Failed after too many retires.")),
    };

    async function executeTransactionOnce(): Promise<
      | { output: Output }
      | {
          canRetry: boolean;
          failedItems: {
            dictionaryName: string;
            key: string;
            namespace?: string;
          }[];
        }
    > {
      // a map of the keys of all mutable dictionary calls that have been made to the request
      const dictionaryCalls = new Map<
        string,
        DictionaryCall<DictionarySetOperation | DictionaryDeleteOperation>
      >();
      // store all of the event and signal calls to execute after the transaction completes
      const eventCalls: (PublishEventsCall | SendSignalCall)[] = [];
      // a map of the keys of all get operations or mutation operations to check during the transaction.
      // also serves as a get cache when get is called multiple times on the same keys
      const retrievedEntities = new Map<
        string,
        EntityWithMetadata<any> | undefined
      >();

      const eventualCallHook: EventualCallHook = {
        registerEventualCall: (eventual) => {
          if (isDictionaryCall(eventual)) {
            if (
              isDictionaryCallOfType("set", eventual) ||
              isDictionaryCallOfType("delete", eventual)
            ) {
              return createEventualPromise<
                Awaited<
                  ReturnType<Dictionary<any>["delete"] | Dictionary<any>["set"]>
                >
              >(async () => {
                const entity = await resolveEntity(
                  eventual.name,
                  eventual.operation.key
                );
                const normalizedKey = serializeCompositeKey(
                  eventual.name,
                  eventual.operation.key
                );

                // TODO
                dictionaryCalls.set(normalizedKey, eventual);
                return isDictionaryCallOfType("set", eventual)
                  ? { version: (entity?.version ?? 0) + 1 }
                  : undefined;
              });
            } else if (
              isDictionaryCallOfType("get", eventual) ||
              isDictionaryCallOfType("getWithMetadata", eventual)
            ) {
              return createEventualPromise(async () => {
                const value = await resolveEntity(
                  eventual.name,
                  eventual.operation.key
                );

                if (isDictionaryCallOfType("get", eventual)) {
                  return value?.entity;
                } else if (
                  isDictionaryCallOfType("getWithMetadata", eventual)
                ) {
                  return value;
                }
                return assertNever(eventual);
              });
            }
          } else if (isPublishEventsCall(eventual)) {
            eventCalls.push(eventual);
            return createResolvedEventualPromise(Result.resolved(undefined));
          } else if (isSendSignalCall(eventual)) {
            eventCalls.push(eventual);
            return createResolvedEventualPromise(Result.resolved(undefined));
          }
          throw new Error(
            `Unsupported eventual call type. Only Dictionary requests, publish events, and send signals are supported.`
          );
        },
        /**
         * Not used
         */
        resolveEventual: () => {},
      };

      const output = await serviceTypeScope(
        ServiceType.TransactionWorker,
        async () =>
          await enterEventualCallHookScope(
            eventualCallHook,
            async () =>
              // TODO context
              await transactionFunction(input, {})
          )
      );

      const versionOverridesIndices: Set<number> = new Set();

      /**
       * Build the transaction items that contain mutations with assertions or just assertions.
       */
      const transactionItems: DictionaryTransactItem<any, string>[] = [
        ...new Set([...dictionaryCalls.keys(), ...retrievedEntities.keys()]),
      ].map((normalizedKey, i) => {
        const retrieved = retrievedEntities.get(normalizedKey);
        const call = dictionaryCalls.get(normalizedKey);

        const [dictionary, key] = deserializeCompositeKey(normalizedKey);

        const retrievedVersion = retrieved?.version ?? 0;
        if (call) {
          // if the user provided a version that was not the same that was retrieved
          // we will consider the transaction not retry-able on failure.
          // for example, if a entity is set with an expected version of 1,
          //              but the current version at set time is 2, this condition
          ///             will never be true.
          if (
            call.operation.options?.expectedVersion !== undefined &&
            call.operation.options?.expectedVersion !== retrievedVersion
          ) {
            versionOverridesIndices.add(i);
            return { dictionary, operation: call.operation };
          }
          return {
            dictionary,
            operation: {
              ...call.operation,
              options: {
                ...call.operation.options,
                expectedVersion: retrievedVersion,
              },
            },
          };
        } else {
          // values that are retrieved only, will be checked using a condition
          return {
            dictionary,
            operation: {
              operation: "condition",
              key,
              version: retrievedVersion,
            },
          };
        }
      });

      /**
       * Run the transaction
       */
      const result =
        transactionItems.length > 0
          ? await dictionaryStore.transactWrite(transactionItems)
          : undefined;

      /**
       * If the transaction failed, check if it is retryable or not.
       */
      if (isTransactionCancelledResult(result)) {
        const retry = !result.reasons.some((r, i) =>
          isUnexpectedVersionResult(r) ? versionOverridesIndices.has(i) : false
        );
        return {
          canRetry: retry,
          failedItems: result.reasons
            .map((r, i) => {
              if (isUnexpectedVersionResult(r)) {
                const x = transactionItems[i]!;
                const { key, namespace } = normalizeCompositeKey(
                  x.operation.key
                );
                return { dictionaryName: x.dictionary, key, namespace };
              }
              return undefined;
            })
            .filter((i): i is Exclude<typeof i, undefined> => !!i),
        };
      } else {
        /**
         * If the transaction succeeded, publish events and send signals.
         */
        await Promise.allSettled(
          eventCalls.map(async (call) => {
            if (isPublishEventsCall(call)) {
              await eventClient.publishEvents(...call.events);
            } else if (call) {
              // shouldn't happen
              if (call.target.type === SignalTargetType.ChildExecution) {
                return;
              }
              await executionQueueClient.sendSignal({
                execution: call.target.executionId,
                signal: call.signalId,
                payload: call.payload,
              });
            }
          })
        );
      }

      return { output };

      function resolveEntity(
        dictionaryName: string,
        key: string | CompositeKey
      ): EventualPromise<EntityWithMetadata<any> | undefined> {
        const normalizedKey = serializeCompositeKey(dictionaryName, key);
        if (retrievedEntities.has(normalizedKey)) {
          return createResolvedEventualPromise(
            Result.resolved(retrievedEntities.get(normalizedKey))
          );
        } else {
          return createEventualPromise(async () => {
            const value = await dictionaryStore.getDictionaryValue(
              dictionaryName,
              key
            );
            retrievedEntities.set(normalizedKey, value);
            return value;
          });
        }
      }
    }
  };
}

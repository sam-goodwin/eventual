import { CompositeKey, DictionaryTransactItem } from "@eventual/core";
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
  SignalTargetType,
} from "@eventual/core/internal";
import {
  deserializeCompositeKey,
  DictionaryStore,
  EntityWithMetadata,
  EventClient,
  ExecutionQueueClient,
  isTransactionCancelledResult,
  serializeCompositeKey,
} from "./index.js";
import { isResolved } from "./result.js";

export interface TransactionFunction<Input, Output> {
  (input: Input, context: any): Promise<Output> | Output;
}

/**
 * Provide a hooked and labelled promise for all of the {@link Eventual}s.
 *
 * Exposes a resolve method which accepts a {@link Result} object. Adds the seq ID to
 * allow future identification of EventualPromises.
 */
export function createResolvedEventualPromise<R>(
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

export function createEventualPromise<R>(
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

export async function executeTransaction<Input, Output>(
  transactionFunction: TransactionFunction<Input, Output>,
  dictionaryStore: DictionaryStore,
  executionQueueClient: ExecutionQueueClient,
  eventClient: EventClient,
  input: Input
) {
  const dictionaryCalls = new Map<
    string,
    DictionaryCall<DictionarySetOperation | DictionaryDeleteOperation>
  >();
  const eventCalls: (PublishEventsCall | SendSignalCall)[] = [];
  const retrievedEntities = new Map<
    string,
    EntityWithMetadata<any> | undefined
  >();

  const eventualCallHook: EventualCallHook<EventualPromise<any>> = {
    registerEventualCall: (eventual) => {
      if (isDictionaryCall(eventual)) {
        if (
          isDictionaryCallOfType("set", eventual) ||
          isDictionaryCallOfType("delete", eventual)
        ) {
          return createEventualPromise<{ version: number }>(async () => {
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
            return { version: (entity?.version ?? 0) + 1 };
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
            } else if (isDictionaryCallOfType("getWithMetadata", eventual)) {
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

  const output = await enterEventualCallHookScope(
    eventualCallHook,
    async () => {
      // TODO context
      return await transactionFunction(input, {});
    }
  );

  const transactionItems: DictionaryTransactItem<any, string>[] = [
    ...new Set([...dictionaryCalls.keys(), ...retrievedEntities.keys()]),
  ].map((normalizedKey) => {
    const retrieved = retrievedEntities.get(normalizedKey);
    const call = dictionaryCalls.get(normalizedKey);

    const [dictionary, key] = deserializeCompositeKey(normalizedKey);

    if (call) {
      return call.operation.options?.expectedVersion
        ? { dictionary, operation: call.operation }
        : {
            dictionary,
            operation: {
              ...call.operation,
              options: {
                ...call.operation.options,
                expectedVersion: retrieved?.version ?? 0,
              },
            },
          };
    } else {
      return {
        dictionary,
        operation: {
          operation: "condition",
          key,
          version: retrieved?.version ?? 0,
        },
      };
    }
  });

  const result = await dictionaryStore.transactWrite(transactionItems);
  if (isTransactionCancelledResult(result)) {
    // retry
  } else {
    await Promise.all(
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

  return output;

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

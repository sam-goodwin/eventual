import { DictionaryStreamItem, EventualServiceClient } from "@eventual/core";
import {
  ServiceType,
  dictionaries,
  registerDictionaryHook,
  registerServiceClient,
  serviceTypeScope,
} from "@eventual/core/internal";
import { DictionaryClient } from "../clients/dictionary-client.js";

export interface DictionaryStreamWorker {
  (item: DictionaryStreamItem<any>): false | void | Promise<false | void>;
}

interface DictionaryStreamWorkerDependencies {
  eventualClient?: EventualServiceClient;
  dictionaryClient?: DictionaryClient;
}

export function createDictionaryStreamWorker(
  dependencies: DictionaryStreamWorkerDependencies
): DictionaryStreamWorker {
  if (dependencies.eventualClient) {
    registerServiceClient(dependencies.eventualClient);
  }
  if (dependencies.dictionaryClient) {
    registerDictionaryHook(dependencies.dictionaryClient);
  }

  return async (item) =>
    serviceTypeScope(ServiceType.DictionaryStreamWorker, async () => {
      const streamHandler = dictionaries()
        .get(item.dictionaryName)
        ?.streams.find((s) => s.name === item.streamName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.streamName} does not exist`);
      }
      return await streamHandler.handler(item);
    });
}

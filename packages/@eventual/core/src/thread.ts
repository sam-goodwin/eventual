import {
  ActivityKind,
  ActivitySymbol,
  isActivity,
  registerActivity,
} from "./activity";

let threadIDCounter = 0;

export function resetThreadIDCounter() {
  threadIDCounter = 0;
}

export function nextThreadID(): number {
  return ++threadIDCounter;
}

let _currentThreadID: number = 0;

export function setCurrentThreadID(id: number): number {
  return (_currentThreadID = id);
}

export function resetCurrentThreadID(): number {
  return setCurrentThreadID(0);
}

export function currentThreadID(): number {
  return _currentThreadID;
}

export function isThread(a: any): a is Thread {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Thread;
}

export interface Thread {
  [ActivitySymbol]: ActivityKind.Thread;
  id: number;
  thread: Generator;
}

export function scheduleThread(thread: Generator, index?: number): Thread {
  return registerActivity({
    [ActivitySymbol]: ActivityKind.Thread,
    id: index ?? nextThreadID(),
    thread,
  });
}

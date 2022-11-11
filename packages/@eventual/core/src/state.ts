import { Result } from "./result";

export interface State {
  threads: Result[][];
}

export function mergeEventsIntoState(_events: Event[], state: State): State {
  // TODO

  return state;
}

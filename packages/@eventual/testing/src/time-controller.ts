import { Heap } from "heap-js";

export interface TimeControllerProps {
  start?: number;
  /**
   * @default - 1
   */
  increment?: number;
}

export interface TimeEvent<E = any> {
  timestamp: number;
  event: E;
}

/**
 * An implementation of a runtime where time is controlled and incremental.
 *
 * Uses real time as a based, but can start at any time and only progresses when explicitly told to.
 */
export class TimeController<E = any> {
  // current millisecond time
  #current: number = 0;
  #increment: number;
  #timeHeap: Heap<TimeEvent<E>>;

  constructor(initialEvents: TimeEvent<E>[], props?: TimeControllerProps) {
    this.#current = props?.start ?? 0;
    this.#increment = props?.increment ?? 1;
    this.#timeHeap = new Heap<TimeEvent<E>>(
      (a, b) => a.timestamp - b.timestamp
    );
    this.#timeHeap.init(initialEvents);
  }

  /**
   * Progress n `increment`s and return all events, in order, which happened.
   *
   * @param n - number of increments to progress time.
   */
  tick(n: number = 1): E[] {
    this.#current += this.#increment * n;
    return this.getPastEvents();
  }

  /**
   * Progresses time by `increment`s until at most the given `goal` time.
   * Returns all events, in order, which happened from `current` until the final time, inclusive.
   *
   * @param goal a point in the future to progress until.
   *             If the goal is in the past, an error will be thrown.
   *             If goal is not a factor of increment from start (`start + (increment * X)`)
   *             the new time will reduced. (`floor((goal - current) / increment))`).
   * @returns All events between current and current + goal.
   */
  tickUntil(goal: number): E[] {
    if (goal < this.#current) {
      throw new Error(
        "Cannot travel into the past. Use TimeController.time to get the current time."
      );
    }
    return this.tick(Math.floor((goal - this.#current) / this.#increment));
  }

  /**
   * Returns the current time, an increment of props.increment from the props.start.
   */
  get time() {
    return this.#current;
  }

  /**
   * Returns the current time, an increment of props.increment from the props.start.
   */
  get nextTime() {
    return this.#current + this.#increment;
  }

  /**
   * Returns the timestamp on the next event which exists.
   */
  get nextEventTime(): number | undefined {
    return this.#timeHeap.peek()?.timestamp;
  }

  /**
   * Returns any events at or before the current time.
   *
   * Only possible when events are added that are in the past.
   */
  getPastEvents() {
    return [...this.pastEvents()];
  }

  /**
   * @returns true when there are events prior to the current time.
   *          only possible when events are added that are in the past.
   */
  hasPastEvents() {
    return this.hasCurrentOrPastEvents();
  }

  /**
   * Add an event to the {@link TimeController}.
   */
  addEvent(timestamp: number, event: E): void {
    this.#timeHeap.add({ timestamp, event });
  }

  /**
   * Add an event to the {@link TimeController}.
   */
  addEventAtNext(event: E): void {
    this.#timeHeap.add({ timestamp: this.nextTime, event });
  }

  /**
   * Add events to the {@link TimeController}.
   */
  addEvents(timeEvents: TimeEvent<E>[]): void {
    this.#timeHeap.addAll(timeEvents);
  }

  /**
   * Resets time to a given number and clears the events.
   *
   * @param current - the timestamp to set as the new start time, when not provided, does not reset the current time.
   */
  reset(current?: number) {
    this.#current = current ?? this.#current;
    this.#timeHeap.clear();
  }

  private *pastEvents() {
    while (this.hasCurrentOrPastEvents()) {
      yield this.#timeHeap.pop()!.event;
    }
  }

  private hasCurrentOrPastEvents() {
    const next = this.#timeHeap.peek();
    return next && next.timestamp <= this.#current;
  }
}

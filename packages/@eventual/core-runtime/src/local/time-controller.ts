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
  private current = 0;
  private ordCounter = 0;
  private increment: number;
  private timeHeap: Heap<
    TimeEvent<E> & {
      /**
       * Order the event was added to the heap. Acts as a tie break when events have the same time.
       */
      ord: number;
    }
  >;

  constructor(
    initialEvents: TimeEvent<E>[],
    private props?: TimeControllerProps
  ) {
    this.current = props?.start ?? 0;
    this.increment = props?.increment ?? 1;
    this.timeHeap = new Heap<TimeEvent<E> & { ord: number }>((a, b) => {
      const diff = a.timestamp - b.timestamp;
      if (diff === 0) {
        return a.ord - b.ord;
      }
      return diff;
    });
    this.timeHeap.init(
      initialEvents.map((e) => ({ ...e, ord: this.ordCounter++ }))
    );
  }

  /**
   * Progress n `increment`s and return all events, in order, which happened.
   *
   * @param n - number of increments to progress time.
   */
  public tick(n = 1): E[] {
    this.current += this.increment * n;
    return this.drainPastEvents();
  }

  /**
   * Creates a generator which returns events grouped by tick number.
   *
   * More efficient than passing in each tick number because it only requests tick numbers which have values.
   */
  public *tickIncremental(n: number) {
    const goal = this.current + this.increment * n;
    while (this.current < goal) {
      // only get the next there are events
      const next = this.nextEventTick;
      if (next === undefined || next >= goal) {
        yield this.tickUntil(goal);
        return;
      }
      yield this.tickUntil(next);
    }
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
  public tickUntil(goal: number): E[] {
    if (goal < this.current) {
      return this.drainPastEvents();
    }
    return this.tick(Math.floor((goal - this.current) / this.increment));
  }

  /**
   * Returns the current tick, an increment of props.increment from the props.start.
   */
  public get currentTick() {
    return this.current;
  }

  /**
   * Returns the next tick, an increment of props.increment from the props.start.
   */
  public get nextTick() {
    return this.current + this.increment;
  }

  /**
   * Returns the timestamp on the next event which exists.
   */
  public get nextEventTick(): number | undefined {
    return this.timeHeap.peek()?.timestamp;
  }

  /**
   * Returns any events at or before the current time.
   *
   * Only possible when events are added that are in the past.
   */
  public drainPastEvents() {
    return [...this.drainEvents()];
  }

  /**
   * @returns true when there are events prior to the current time.
   *          only possible when events are added that are in the past.
   */
  public hasPastEvents() {
    return this.hasCurrentOrPastEvents();
  }

  /**
   * Add an event to the {@link TimeController}.
   */
  public addEvent(timestamp: number, event: E): void {
    this.timeHeap.add({ timestamp, event, ord: this.ordCounter++ });
  }

  /**
   * Add an event to the {@link TimeController}.
   */
  public addEventAtNextTick(event: E): void {
    this.addEvent(this.nextTick, event);
  }

  /**
   * Add events to the {@link TimeController}.
   */
  public addEvents(timeEvents: TimeEvent<E>[]): void {
    this.timeHeap.addAll(
      timeEvents.map((e) => ({ ...e, ord: this.ordCounter++ }))
    );
  }

  /**
   * Resets time to a given number and clears the events.
   *
   * @param current - the timestamp to set as the new start time, when not provided, does not reset the current time.
   */
  public reset(current?: number) {
    this.current = current ?? this.props?.start ?? 0;
    this.timeHeap.clear();
  }

  private *drainEvents() {
    while (this.hasCurrentOrPastEvents()) {
      yield this.timeHeap.pop()!.event;
    }
  }

  private hasCurrentOrPastEvents() {
    const next = this.timeHeap.peek();
    return next && next.timestamp <= this.current;
  }
}

import { TimeController, TimeEvent } from "../src/local/time-controller.js";

test("empty", () => {
  const controller = new TimeController([]);

  expect(controller.tick(100)).toHaveLength(0);
});

test("populate", () => {
  const controller = new TimeController<{ id: number }>([
    {
      event: event(1),
      timestamp: 1,
    },
  ]);

  expect(controller.tick(100)).toMatchObject([event(1)]);
});

test("tick once", () => {
  const controller = new TimeController<{ id: number }>([
    {
      event: event(1),
      timestamp: 1,
    },
  ]);

  expect(controller.tick()).toMatchObject([event(1)]);
});

test("tick once with no result", () => {
  const controller = new TimeController<{ id: number }>([
    {
      event: event(1),
      timestamp: 2,
    },
  ]);

  expect(controller.tick()).toMatchObject([]);
});

test("tick twice with result", () => {
  const controller = new TimeController<{ id: number }>([
    {
      event: event(1),
      timestamp: 2,
    },
  ]);

  expect(controller.tick()).toMatchObject([]);
  expect(controller.tick()).toMatchObject([event(1)]);
});

test("push future", () => {
  const controller = new TimeController<{ id: number }>([]);

  controller.addEvent(1, event(1));

  expect(controller.tick()).toMatchObject([event(1)]);
});

test("push past", () => {
  const controller = new TimeController<{ id: number }>([]);

  expect(controller.tick()).toMatchObject([]);

  controller.addEvent(1, event(1));

  expect(controller.drainPastEvents()).toMatchObject([event(1)]);
});

test("push past and future", () => {
  const controller = new TimeController<{ id: number }>([]);

  expect(controller.tick()).toMatchObject([]);

  controller.addEvent(1, event(1));
  controller.addEvent(3, event(2));

  expect(controller.tick(2)).toMatchObject([event(1), event(2)]);
});

test("push past and future out of order", () => {
  const controller = new TimeController<{ id: number }>([]);

  expect(controller.tick()).toMatchObject([]);

  controller.addEvent(3, event(2));
  controller.addEvent(1, event(1));

  expect(controller.tick(2)).toMatchObject([event(1), event(2)]);
});

test("push past and future out of order", () => {
  const controller = new TimeController<{ id: number }>([]);

  controller.addEvent(3, event(2));

  expect(controller.tick()).toMatchObject([]);

  controller.addEvent(1, event(1));

  expect(controller.tick(2)).toMatchObject([event(1), event(2)]);
});

test("push past and future out of order 2", () => {
  const controller = new TimeController<{ id: number }>([]);

  controller.addEvent(1, event(1));

  expect(controller.tick()).toMatchObject([event(1)]);

  controller.addEvent(3, event(2));

  expect(controller.tick(2)).toMatchObject([event(2)]);
});

test("same time are unordered", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(1, 2),
    eventWithTime(1, 3),
    eventWithTime(1, 4),
  ]);

  const events = controller.tick();

  expect(events).toEqual(
    expect.arrayContaining([event(1), event(2), event(3), event(4)])
  );
});

test("different time are ordered", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(3, 3),
    eventWithTime(4, 4),
  ]);

  expect(controller.tick(4)).toEqual([event(1), event(2), event(3), event(4)]);
});

test("step tick", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(3, 3),
    eventWithTime(4, 4),
  ]);

  expect(controller.tick(2)).toEqual([event(1), event(2)]);
  expect(controller.tick(2)).toEqual([event(3), event(4)]);
});

test("tick until", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(3, 3),
    eventWithTime(4, 4),
  ]);

  expect(controller.tickUntil(3)).toEqual([event(1), event(2), event(3)]);
});

test("zero time is immediately available", () => {
  const controller = new TimeController<{ id: number }>([eventWithTime(0, 1)]);

  expect(controller.drainPastEvents()).toEqual([event(1)]);
});

test("start from arbitrary time", () => {
  const controller = new TimeController<{ id: number }>(
    [
      eventWithTime(1, 1),
      eventWithTime(2, 2),
      eventWithTime(3, 3),
      eventWithTime(4, 4),
    ],
    { start: 10000 }
  );

  expect(controller.drainPastEvents()).toEqual([
    event(1),
    event(2),
    event(3),
    event(4),
  ]);
});

test("larger increments", () => {
  const controller = new TimeController<{ id: number }>(
    [
      eventWithTime(1, 1),
      eventWithTime(2, 2),
      eventWithTime(3, 3),
      eventWithTime(4, 4),
    ],
    { increment: 20 }
  );

  expect(controller.tick()).toEqual([event(1), event(2), event(3), event(4)]);
});

test("larger increments 2", () => {
  const controller = new TimeController<{ id: number }>(
    [
      eventWithTime(1, 1),
      eventWithTime(2, 2),
      eventWithTime(23, 3),
      eventWithTime(24, 4),
    ],
    { increment: 20 }
  );

  expect(controller.tick()).toEqual([event(1), event(2)]);
  expect(controller.tick()).toEqual([event(3), event(4)]);
});

test("reset", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(3, 3),
    eventWithTime(4, 4),
  ]);

  controller.reset();

  expect(controller.tick(10000)).toEqual([]);
});

test("tick until", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(23, 3),
    eventWithTime(24, 4),
  ]);

  expect(controller.tickUntil(20)).toEqual([event(1), event(2)]);
  expect(controller.tickUntil(23)).toEqual([event(3)]);
  expect(controller.tickUntil(24)).toEqual([event(4)]);
});

test("tick until partial increment", () => {
  const controller = new TimeController<{ id: number }>(
    [
      eventWithTime(1, 1),
      eventWithTime(2, 2),
      eventWithTime(23, 3),
      eventWithTime(24, 4),
    ],
    { increment: 20 }
  );

  // next increment is 20
  expect(controller.tickUntil(10)).toEqual([]);
  expect(controller.tickUntil(10)).toEqual([]);
  expect(controller.tickUntil(10)).toEqual([]);
  expect(controller.tickUntil(10)).toEqual([]);
  expect(controller.tickUntil(25)).toEqual([event(1), event(2)]);
  // next increment is 40
  expect(controller.tickUntil(35)).toEqual([]);
  expect(controller.tickUntil(45)).toEqual([event(3), event(4)]);
});

test("tick until past returns only past events", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(1, 1),
    eventWithTime(2, 2),
    eventWithTime(23, 3),
    eventWithTime(24, 4),
  ]);

  controller.tick(10);

  controller.addEvent(5, event(5));

  expect(controller.tickUntil(5)).toEqual([event(5)]);
});

test("tick incremental", () => {
  const controller = new TimeController<{ id: number }>([
    eventWithTime(10, 1),
    eventWithTime(11, 2),
    eventWithTime(23, 3),
    eventWithTime(23, 4),
    eventWithTime(105, 5),
    eventWithTime(115, 6),
  ]);

  controller.tick(5);

  controller.addEvent(3, event(0));

  expect([...controller.tickIncremental(100)]).toEqual([
    [event(0)],
    // grab event at location 1
    [event(1)],
    // grab event at location 2
    [event(2)],
    // the order of same time events are undefined
    expect.arrayContaining([event(3), event(4)]),
    [event(5)],
  ]);
});

function eventWithTime(time: number, id: number): TimeEvent<{ id: number }> {
  return { timestamp: time, event: event(id) };
}

function event(id: number) {
  return { id };
}

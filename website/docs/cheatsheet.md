---
sidebar_position: 4
---

# Cheatsheet

This documentation contains a set of techniques and strategies for structuring workflows in Eventual. These patterns provide best practices and established solutions for common problems to help you build effective applications.

## Run a sub-procedure

Sometimes it is useful to break up a workflow into smaller, reusable pieces. You can do this by defining nested functions within your workflow and calling them as needed.

```ts
workflow("foo", async () => {
  await subProcedure(1);
  await subProcedure(2);

  async function subProcedure(input) {
    const a = await taskA(input);
    return taskB(a);
  }
});
```

## Recursive functions

Recursive functions are functions that call themselves. This is a powerful programming technique that allows you to write code that repeats a certain process until a certain condition is met.

```ts
workflow("foo", async () => {
  await retryTask(3);

  async function retryTask(attemptsLeft: number) {
    try {
      await taskA();
    } catch {
      if (attemptsLeft > 0) {
        await retry(attemptsLeft - 1);
      }
    }
  }
});
```

## Recursive Workflows

Recursive workflows allow you to create a workflow that calls itself, creating a new execution each time. This can be useful when you have a workflow that needs to perform a large number of tasks, as each recursive call creates a separate event log and therefore improves scalability. If the size of a single execution is finite, then a recursive workflow can run indefinitely without any scaling issues.

Here's an example of how you can use a recursive workflow to perform tasks on a daily basis:

```ts
const dailyWorkflow = workflow("daily", async (nextDate: string) => {
  await sleepUntil(nextDate);

  await stepA();
  await stepB();
  // ..
  await stepC();

  // workflow is done, start a child workflow for the next date
  await dailyWorkflow(computeNextRunTime(nextDate));
});
```

## Event Loop

Using a `while` loop and a `signal`, you can create an event loop workflow that waits for an event to be received, takes some action, and then waits for the next event.

```ts
type GameEvent = MoveLeft | MoveRight | Done;
interface Done {
  type: "Done";
}
interface MoveLeft {
  type: "MoveLeft";
  amount: number;
}
interface MoveRight {
  type: "MoveRight";
  amount: number;
}

const gameEvent = signal<GameEvent>("GameEvent");

const game = workflow("game", async () => {
  let position = 0;
  while (true) {
    const event = await gameEvent.expectSignal();
    if (event.type === "Done") {
      break;
    } else if (event.type === "MoveLeft") {
      position -= event.amount;
    } else {
      position += event.amount;
    }
  }
});
```

## Concurrency Patterns

The [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) utility functions in Node.js allow you to concurrently run multiple tasks in your workflow. You can use these functions to structure your workflow in order to achieve specific concurrent behaviors.

- [`Promise.all`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all) waits for all the tasks to succeed before continuing. If any of the Promises reject, the whole Promise will also reject with the error.
- [`Promise.allSettled`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) waits for all the tasks to either resolve or reject, and then continues.
- [`Promise.any`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any) waits for the first of the tasks to resolve, and then continues. If none resolve then an [AggregateError](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError) is thrown containing a list of all the errors.
- [`Promise.race`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race) waits for the first of the tasks to either resolve or reject, and then continues.

Here are some examples of how you can use these functions in your workflow to:

### Run two activities in parallel and wait for both to succeed

```ts
const [a, b] = await Promise.all([activityA(), activityB()]);
```

### Run two sub-procedures in parallel and wait for both to succeed

```ts
workflow("a and b", async () => {
  await Promise.all([a(), b()]);

  async function a() {
    await task1();

    await task2();
  }

  async function b() {
    await task3();

    await task4();
  }
});
```

### Wait for a condition to be true or for a specific date to occur:

```ts
let isCancelled = false;

cancelSignal.onSignal(() => (isCancelled = true));

await Promise.race([
  // sleep while some condition is true
  sleepWhile(() => !isCancelled),
  // sleep for 10s
  sleepFor(10, "seconds"),
]);
```

### Wait for a condition to be true or for a specific date to occur

```ts
let isCancelled = false;

cancelSignal.onSignal(() => (isCancelled = true));

await Promise.race([
  // sleep while some condition is true
  sleepWhile(() => !isCancelled),
  // sleep until the first of january, 2013
  sleepUntil("2013-01-01T00:00Z"),
]);
```

### Select the first procedure to complete

```ts
const aOrB = await Promise.race([a(), b()]);
```

### Select the first procedure to complete successfully

```ts
const aOrB = await Promise.any([a(), b()]);
```

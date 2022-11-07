import "jest";
import {
  currentScope,
  inActivity,
  inOrchestrator,
  inSystem,
  Scope,
} from "../src";

test("test", async () => {
  await foo();

  async function foo() {
    expect(currentScope()).toEqual(Scope.System);
    await inSystem(async () => {
      expect(currentScope()).toEqual(Scope.System);
    });
    await inActivity(async () => {
      expect(currentScope()).toEqual(Scope.Activity);
      await (async () => {
        expect(currentScope()).toEqual(Scope.Activity);

        await new Promise((resolve) => {
          expect(currentScope()).toEqual(Scope.Activity);
          resolve(undefined);
        });
      })();

      await Promise.all(
        [1, 2].map(async () => {
          expect(currentScope()).toEqual(Scope.Activity);
        })
      );
    });
    expect(currentScope()).toEqual(Scope.System);
    await inOrchestrator(async () => {
      expect(currentScope()).toEqual(Scope.Orchestrator);
    });
    expect(currentScope()).toEqual(Scope.System);
  }
});

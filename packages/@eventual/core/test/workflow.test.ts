import "jest";
import { currentScope, inActivity, inScope, inSystem } from "../src";

test("test", async () => {
  await foo();

  async function foo() {
    console.log(currentScope());
    await inSystem(async () => {
      console.log(currentScope());
    });
    console.log("===");
    await inActivity(async () => {
      console.log(currentScope());
      await (async () => {
        const nestedScope = currentScope();
        nestedScope;
      })();
    });
    console.log(currentScope());
    console.log("===");
    await inSystem(async () => {
      console.log(currentScope());
    });
    console.log(currentScope());
  }
});

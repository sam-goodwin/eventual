const ogThen = Promise.prototype.then;
const ogCatch = Promise.prototype.catch;
const ogFinally = Promise.prototype.finally;

enum Scope {
  Activity = "Activity",
  Orchestrator = "Orchestrator",
  System = "System",
}

let stack: Scope[] = [Scope.System];

function pushScope(scope: Scope) {
  stack.push(scope);
}

function popScope(): Scope | undefined {
  return stack.pop();
}

export function currentScope(): Scope {
  if (stack.length === 0) {
    throw new Error(`Eventual Error: stack underflow`);
  }
  return stack[stack.length - 1]!;
}

// @ts-ignore - state is an implicit parameter added for Eventual
Promise.prototype.then = function (
  this: Promise<any>,
  resolve,
  reject,
  scope = currentScope()
) {
  return ogThen.bind(this)(
    resolve,
    reject,
    // @ts-ignore - our special context parameter value
    scope
  );
};

// @ts-ignore - state is an implicit parameter added for Eventual
Promise.prototype.catch = function (reject, scope = currentScope()) {
  return ogCatch.bind(this)(
    reject,
    // @ts-ignore - our special context parameter value
    scope
  );
};

// @ts-ignore - state is an implicit parameter added for Eventual
Promise.prototype.finally = function (onFinally, scope) {
  return ogFinally.bind(this)(
    onFinally,
    // @ts-ignore - our special context parameter value
    scope
  );
};

export function inSystem<T>(f: () => Promise<T>): Promise<T> {
  return inScope(Scope.System, f);
}

export function inOrchestrator<T>(f: () => Promise<T>): Promise<T> {
  return inScope(Scope.Orchestrator, f);
}

export function inActivity<T>(f: () => Promise<T>): Promise<T> {
  return inScope(Scope.Activity, f);
}

export function inScope<T>(scope: Scope, f: () => Promise<T>): Promise<T> {
  pushScope(scope);
  const result = f();
  popScope();
  return result;
}

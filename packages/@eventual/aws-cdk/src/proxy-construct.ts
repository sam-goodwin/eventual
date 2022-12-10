export function proxyConstruct<Iter extends object>(): Iter & {
  _bind: (real: Iter) => void;
} {
  const calls: [keyof Iter, any[]][] = [];
  let real: Iter | undefined = undefined;

  const bind = (obj: Iter) => {
    real = obj;
    calls.forEach(([name, args]) => {
      (obj[name] as Function)?.apply(obj, args);
    });
  };

  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "_bind") {
          return bind;
        } else if (real) {
          return (real[prop as keyof Iter] as Function).bind(real);
        }
        return new Proxy(() => {}, {
          apply: (_target, _this, args) => {
            calls.push([prop as keyof Iter, args]);
          },
        });
      },
    }
  ) as Iter & { _bind: () => {} };
}

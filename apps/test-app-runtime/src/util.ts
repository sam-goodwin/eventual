export function memoize<T extends any[], R>(
  fn: (...args: T) => R
): (...args: T) => R {
  //We box our cache in case our fn returns undefined
  let res: { value: R } | undefined;
  return (...args) => {
    if (res) {
      return res.value;
    } else {
      const result = fn(...args);
      res = { value: result };
      return result;
    }
  };
}

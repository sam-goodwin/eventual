export function deepClone<T>(item: T): T {
  // TODO: more efficient deep clone
  return item === undefined ? item : JSON.parse(JSON.stringify(item));
}

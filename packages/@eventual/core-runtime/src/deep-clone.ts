export function deepClone<T>(item: T): T {
  // TODO: more efficient deep clone
  return JSON.parse(JSON.stringify(item));
}

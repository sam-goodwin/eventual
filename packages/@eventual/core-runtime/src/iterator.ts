export interface _Iterator<I, T extends I = I> {
  hasNext(): boolean;
  next(): T | undefined;
  drain(): T[];
  size(): number;
}

export function iterator<I, T extends I>(
  elms: I[],
  predicate?: (elm: I) => elm is T
): _Iterator<I, T> {
  let cursor = 0;
  return {
    hasNext: () => {
      seek();
      return cursor < elms.length;
    },
    next: (): T => {
      seek();
      return elms[cursor++] as T;
    },
    drain: (): T[] => {
      const events = predicate
        ? elms.slice(cursor).filter(predicate)
        : (elms.slice(cursor) as T[]);
      cursor = elms.length;
      return events;
    },
    size: (): number => {
      return predicate
        ? elms.filter(predicate).length - cursor
        : elms.length - cursor;
    },
  };

  function seek() {
    if (predicate) {
      while (cursor < elms.length) {
        if (predicate(elms[cursor]!)) {
          return;
        }
        cursor++;
      }
    }
  }
}

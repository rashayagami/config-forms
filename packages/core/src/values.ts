/** A form's values: component ids to values; a repeater holds an array of row objects. */
export type FormValues = Record<string, unknown>;

/** Whether a value counts as "nothing entered" for `required` and `filled`. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Copies plain JSON structure; other objects (File, Date) are kept by reference. */
export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneJson(item)) as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = cloneJson(value[key]);
    return out as T;
  }
  return value;
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Reads a dotted path ("rows.2.qty") from nested objects and arrays. */
export function getAt(values: unknown, path: string): unknown {
  let current: unknown = values;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || UNSAFE_KEYS.has(segment))
      return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Deep structural equality for JSON-like values (used for dirty checks on small values only). */
export function jsonEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => jsonEquals(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => jsonEquals(a[key], b[key]));
  }
  return false;
}

import type { Condition, Primitive } from './config.js';
import { getAt, isEmptyValue } from './values.js';

/** Maps a component id to the value path it reads in the current context. */
export type PathResolver = (componentId: string) => string;

const identity: PathResolver = (id) => id;

/** Every component id a condition reads, in first-seen order. */
export function conditionFields(condition: Condition, into: string[] = []): string[] {
  if ('all' in condition) {
    for (const inner of condition.all) conditionFields(inner, into);
  } else if ('any' in condition) {
    for (const inner of condition.any) conditionFields(inner, into);
  } else if ('not' in condition) {
    conditionFields(condition.not, into);
  } else if (!into.includes(condition.field)) {
    into.push(condition.field);
  }
  return into;
}

function primitiveEquals(actual: unknown, expected: Primitive): boolean {
  if (expected === null) return actual === null || actual === undefined;
  return actual === expected;
}

function compare(
  actual: unknown,
  op: 'gt' | 'gte' | 'lt' | 'lte',
  expected: number | string,
): boolean {
  // Numbers compare with numbers, ISO dates with strings; anything else is false.
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || Number.isNaN(actual)) return false;
  } else if (typeof actual !== 'string' || actual === '') {
    return false;
  }
  const a = actual as number | string;
  if (op === 'gt') return a > expected;
  if (op === 'gte') return a >= expected;
  if (op === 'lt') return a < expected;
  return a <= expected;
}

/**
 * Evaluates a condition against form values. A closed interpreter over the
 * operators of `Condition`: nothing from a configuration is executed.
 */
export function evaluateCondition(
  condition: Condition,
  values: unknown,
  resolve: PathResolver = identity,
): boolean {
  if ('all' in condition)
    return condition.all.every((inner) => evaluateCondition(inner, values, resolve));
  if ('any' in condition)
    return condition.any.some((inner) => evaluateCondition(inner, values, resolve));
  if ('not' in condition) return !evaluateCondition(condition.not, values, resolve);
  const actual = getAt(values, resolve(condition.field));
  switch (condition.op) {
    case 'eq':
      return primitiveEquals(actual, condition.value);
    case 'neq':
      return !primitiveEquals(actual, condition.value);
    case 'in':
      return condition.value.some((expected) => primitiveEquals(actual, expected));
    case 'notIn':
      return !condition.value.some((expected) => primitiveEquals(actual, expected));
    case 'includes':
      return Array.isArray(actual) && actual.includes(condition.value);
    case 'filled':
      return !isEmptyValue(actual);
    case 'empty':
      return isEmptyValue(actual);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compare(actual, condition.op, condition.value);
  }
}

import {
  validateValues,
  type CompiledForm,
  type CustomValidator,
  type FormValues,
  type MessageKey,
  type ValidationResult,
} from '@form-config/core';
import type { FieldErrors, Resolver } from 'react-hook-form';

/**
 * Which fields a validation covers. react-hook-form passes the resolver only
 * the names of mounted fields, which on a multi-page form are just the
 * current page's; the renderer sets this scope before submitting or moving
 * between pages so the right fields are checked.
 */
export interface ValidationScope {
  current: { readonly pages: readonly string[] } | { readonly all: true } | null;
  /** The ordered result of the latest validation, to find the first error. */
  last: ValidationResult | null;
}

export interface ResolverOptions {
  validators: Readonly<Record<string, CustomValidator>>;
  messages: Partial<Record<MessageKey | 'checked', string>> | undefined;
}

function setError(target: Record<string, unknown>, path: string, message: string): void {
  const segments = path.split('.');
  let current: Record<string, unknown> = target;
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (last) {
      const existing = current[segment];
      const error = { type: 'validate', message };
      if (existing && typeof existing === 'object') Object.assign(existing, error);
      else current[segment] = error;
      return;
    }
    let next = current[segment];
    if (!next || typeof next !== 'object') {
      next = /^\d+$/.test(segments[index + 1] as string) ? [] : {};
      current[segment] = next;
    }
    current = next as Record<string, unknown>;
  });
}

/** Turns validation messages keyed by path into react-hook-form's nested errors. */
export function toFieldErrors(
  form: CompiledForm,
  errors: Readonly<Record<string, string>>,
): FieldErrors<FormValues> {
  const out: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(errors)) {
    const isRepeater = !path.includes('.') && form.components.get(path)?.kind === 'repeater';
    setError(out, isRepeater ? `${path}.root` : path, message);
  }
  return out as FieldErrors<FormValues>;
}

export function createResolver(
  form: CompiledForm,
  options: { readonly current: ResolverOptions },
): Resolver<FormValues, ValidationScope> {
  return (values, scope, resolverOptions) => {
    const current = scope?.current ?? null;
    const base = {
      validators: options.current.validators,
      ...(options.current.messages ? { messages: options.current.messages } : {}),
    };
    const result =
      current === null
        ? validateValues(form, values, {
            ...base,
            names: (resolverOptions.names ?? []) as string[],
          })
        : 'all' in current
          ? validateValues(form, values, base)
          : validateValues(form, values, { ...base, pages: current.pages });
    if (scope) scope.last = result;
    return result.valid
      ? { values, errors: {} }
      : { values: {}, errors: toFieldErrors(form, result.errors) };
  };
}

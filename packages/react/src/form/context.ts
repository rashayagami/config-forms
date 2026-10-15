'use client';
import {
  resolveState,
  type CompiledForm,
  type ComponentState,
  type FormValues,
} from '@form-config/core';
import { createContext, useContext, useMemo } from 'react';
import { useWatch, type Control, type UseFormGetValues } from 'react-hook-form';
import type { ComponentRegistry } from '../registry.js';
import type { Store, SubmissionState } from './store.js';

export interface RuntimeContextValue {
  readonly form: CompiledForm;
  readonly registry: ComponentRegistry;
  readonly control: Control<FormValues>;
  readonly getValues: UseFormGetValues<FormValues>;
  /** Runs the action configured for a component's event. */
  readonly emit: (componentId: string, event: string) => void;
  /** The id of the control whose action is running, if any. */
  readonly pending: Store<string | null>;
  readonly submission: Store<SubmissionState>;
}

export const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function useRuntime(): RuntimeContextValue {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error('form-config components must be rendered inside <SchemaForm>');
  return value;
}

/**
 * The effective state of a component. Subscribes only to the fields its rules
 * (and its containers' rules) read, so it re-renders when they change and at
 * no other time. A component with no rules subscribes to nothing.
 */
export function useComponentState(id: string, rowPrefix: string): ComponentState {
  const { form, control, getValues } = useRuntime();
  const names = useMemo(
    () => form.stateSources(id).map((source) => form.pathOf(source, rowPrefix)),
    [form, id, rowPrefix],
  );
  useWatch({ control, name: names, disabled: names.length === 0 });
  return resolveState(form, id, getValues(), rowPrefix);
}

/** Whether a layout node or page is visible, with the same narrow subscription. */
export function useVisible(id: string, rowPrefix: string): boolean {
  return useComponentState(id, rowPrefix).visible;
}

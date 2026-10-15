import { useSyncExternalStore } from 'react';

/** A tiny observable value, so status UI can subscribe without re-rendering the form. */
export interface Store<T> {
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T, S>(store: Store<T>, select: (value: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}

export type SubmissionStatus = 'idle' | 'submitting' | 'succeeded' | 'failed';

export interface SubmissionState {
  readonly status: SubmissionStatus;
  /** What the latest submission was: the whole form, or one page. */
  readonly kind: 'final' | 'step' | null;
  readonly pageId: string | null;
  /** The handler's error message when status is "failed". */
  readonly error: string | null;
  /** Pages submitted successfully under "perStep", with a fingerprint of what was sent. */
  readonly submittedPages: Readonly<Record<string, string>>;
}

export const initialSubmissionState: SubmissionState = {
  status: 'idle',
  kind: null,
  pageId: null,
  error: null,
  submittedPages: {},
};

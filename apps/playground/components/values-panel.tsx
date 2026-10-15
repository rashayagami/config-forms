'use client';
import { useSyncExternalStore } from 'react';

/** A value outside React state, so showing it re-renders only the panel, never the form. */
export function createValueStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
    get: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ValueStore<T> = ReturnType<typeof createValueStore<T>>;

export function JsonPanel({
  title,
  store,
}: {
  readonly title: string;
  readonly store: ValueStore<unknown>;
}) {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <section className="pg-panel" aria-label={title}>
      <h2>{title}</h2>
      <pre className="pg-code" data-testid={title}>
        {value === undefined ? 'Nothing yet.' : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

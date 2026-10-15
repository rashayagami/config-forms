'use client';
import {
  builtInDefinitions,
  defaultRegistry,
  SchemaForm,
  withComponent,
  type FieldComponentProps,
} from '@form-config/react';
import { generateLargeConfig } from '@form-config/core/testing';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType } from 'react';

declare global {
  interface Window {
    /** Read by the browser benchmark. */
    __fcBench?: { fields: number; mountMs: number; renders: Record<string, number> };
  }
}

const renders: Record<string, number> = {};

/** The built-in text field, counting its renders for the benchmark. */
function countingRegistry() {
  const text = builtInDefinitions['text'];
  if (!text || text.spec.kind !== 'field') throw new Error('missing text definition');
  const Inner = text.component as ComponentType<FieldComponentProps>;
  function CountingText(props: FieldComponentProps) {
    // Benchmark instrumentation: recording each render is the purpose of this wrapper.
    // eslint-disable-next-line react-hooks/immutability
    renders[props.name] = (renders[props.name] ?? 0) + 1;
    return <Inner {...props} />;
  }
  return defaultRegistry.extend([withComponent(text, CountingText)], { override: true });
}
const registry = countingRegistry();

export function LargeView() {
  const fields = Number(useSearchParams().get('fields') ?? 500);
  const config = useMemo(() => generateLargeConfig(fields), [fields]);
  const [started] = useState(() => performance.now());
  useEffect(() => {
    // After the first commit: the time from starting this component's render to the form being in the DOM.
    window.__fcBench = { fields, mountMs: performance.now() - started, renders };
  }, [fields, started]);
  return (
    <section className="pg-panel" aria-label="Form">
      <SchemaForm config={config} registry={registry} onSubmit={() => {}} />
    </section>
  );
}

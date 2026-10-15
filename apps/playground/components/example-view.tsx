'use client';
import {
  SchemaForm,
  SchemaResponse,
  ThemeProvider,
  type ColorScheme,
  type SubmitHandler,
} from '@form-config/react';
import { useMemo, useRef, useState } from 'react';
import { delay, examples, themes } from '../lib/examples';
import { createValueStore, JsonPanel } from './values-panel';

export function ExampleView({ exampleId }: { readonly exampleId: string }) {
  const example = examples.find((candidate) => candidate.id === exampleId);
  const [themeName, setThemeName] = useState('default');
  const [scheme, setScheme] = useState<ColorScheme>('system');
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);
  const failNext = useRef(false);
  const [failChecked, setFailChecked] = useState(false);
  const values = useMemo(() => createValueStore<unknown>(undefined), []);
  const calls = useMemo(() => createValueStore<unknown>(undefined), []);

  // Handlers deliver values locally; the "fail" switch simulates a server error.
  const handler =
    (name: string): SubmitHandler =>
    async (payload, context) => {
      await delay(600);
      if (failNext.current) {
        failNext.current = false;
        setFailChecked(false);
        throw new Error(`${name} failed (simulated). Try again.`);
      }
      const log = (calls.get() as unknown[] | undefined) ?? [];
      calls.set([...log, { handler: name, kind: context.kind, page: context.pageId, payload }]);
      if (context.kind === 'final') setSubmitted(context.allValues);
    };
  const handlers = {
    'shelter.saveApplicant': handler('shelter.saveApplicant'),
    'shelter.saveHome': handler('shelter.saveHome'),
    'shelter.submitApplication': handler('shelter.submitApplication'),
    'agency.book': handler('agency.book'),
  };

  if (!example) return null;
  const theme = themeName === 'default' ? undefined : themes[themeName];
  return (
    <>
      <div className="pg-toolbar">
        <label>
          Theme
          <select value={themeName} onChange={(e) => setThemeName(e.target.value)}>
            <option value="default">Library default</option>
            <option value="my-company">my-company</option>
            <option value="ocean">ocean</option>
          </select>
        </label>
        <label>
          Colour scheme
          <select value={scheme} onChange={(e) => setScheme(e.target.value as ColorScheme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={failChecked}
            onChange={(e) => {
              failNext.current = e.target.checked;
              setFailChecked(e.target.checked);
            }}
          />
          Fail the next submission
        </label>
      </div>
      <div className="pg-split">
        <ThemeProvider theme={theme} colorScheme={scheme}>
          <section className="pg-panel" aria-label="Form">
            {submitted ? (
              <>
                <SchemaResponse config={example.config} values={submitted} />
                <p>
                  <button type="button" onClick={() => setSubmitted(null)}>
                    Start again
                  </button>
                </p>
              </>
            ) : (
              <SchemaForm
                config={example.config}
                handlers={handlers}
                onSubmit={handler('onSubmit')}
                onValuesChange={(current) => values.set(current)}
              />
            )}
          </section>
        </ThemeProvider>
        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start', minWidth: 0 }}>
          <JsonPanel title="Current values" store={values} />
          <JsonPanel title="Handler calls" store={calls} />
        </div>
      </div>
    </>
  );
}

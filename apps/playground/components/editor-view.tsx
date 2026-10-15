'use client';
import {
  compileConfig,
  configJsonSchema,
  describeCatalog,
  type CompileResult,
} from '@form-config/core';
import { SchemaForm } from '@form-config/react';
import { useDeferredValue, useMemo, useState } from 'react';
import eventRegistration from '../../../examples/event-registration.json';
import { createValueStore, JsonPanel } from './values-panel';

type Tab = 'normalized' | 'catalog' | 'schema' | 'submitted';

export function EditorView() {
  const [text, setText] = useState(() => JSON.stringify(eventRegistration, null, 2));
  const deferred = useDeferredValue(text);
  const [tab, setTab] = useState<Tab>('normalized');
  const submitted = useMemo(() => createValueStore<unknown>(undefined), []);

  // A new parsed object per edit: the form restarts on every valid change, by design.
  const parsed = useMemo(():
    { config: unknown; result: CompileResult } | { parseError: string } => {
    try {
      const config: unknown = JSON.parse(deferred);
      return { config, result: compileConfig(config) };
    } catch (error) {
      return { parseError: (error as Error).message };
    }
  }, [deferred]);

  const panel = (() => {
    if (tab === 'catalog') return describeCatalog();
    if (tab === 'schema') return configJsonSchema();
    if ('result' in parsed && parsed.result.ok) return parsed.result.config;
    return undefined;
  })();

  return (
    <div className="pg-split">
      <section className="pg-panel" aria-label="Config JSON">
        <h2>Config</h2>
        <textarea
          className="pg-editor"
          aria-label="Config JSON"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </section>
      <div style={{ display: 'grid', gap: '1rem', alignContent: 'start', minWidth: 0 }}>
        <section className="pg-panel" aria-label="Result">
          <h2>Result</h2>
          {'parseError' in parsed ? (
            <ul className="pg-issues">
              <li>
                <strong>Not JSON:</strong> {parsed.parseError}
              </li>
            </ul>
          ) : !parsed.result.ok ? (
            <ul className="pg-issues" aria-label="Errors">
              {parsed.result.errors.map((issue, index) => (
                <li key={index}>
                  <code>{issue.code}</code> at <code>{issue.path || '/'}</code>
                  {issue.componentId ? (
                    <>
                      {' '}
                      (component <code>{issue.componentId}</code>)
                    </>
                  ) : null}
                  <br />
                  {issue.message}
                  {issue.expected ? <> Expected {issue.expected}.</> : null}
                  {issue.suggestion ? <> {issue.suggestion}</> : null}
                </li>
              ))}
            </ul>
          ) : (
            <SchemaForm config={parsed.config} onSubmit={(values) => submitted.set(values)} />
          )}
        </section>
        <section className="pg-panel" aria-label="Inspector">
          <div className="pg-tabs" role="group" aria-label="Inspector view">
            {(['normalized', 'submitted', 'catalog', 'schema'] as const).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name === 'normalized'
                  ? 'Normalized config'
                  : name === 'submitted'
                    ? 'Submitted values'
                    : name === 'catalog'
                      ? 'Catalog for a prompt'
                      : 'JSON Schema'}
              </button>
            ))}
          </div>
          {tab === 'submitted' ? (
            <JsonPanel title="Submitted values" store={submitted} />
          ) : (
            <pre className="pg-code">
              {panel === undefined
                ? 'Fix the errors to see the normalized config.'
                : JSON.stringify(panel, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';
import type { ComponentSpec } from '@form-config/core';
import {
  defaultActionRegistry,
  defaultRegistry,
  SchemaForm,
  useTheme,
  type FieldComponentProps,
} from '@form-config/react';
import { useMemo } from 'react';
import { createValueStore, JsonPanel } from './values-panel';

const ratingSpec: ComponentSpec & { readonly kind: 'field' } = {
  type: 'rating',
  description: 'Choose from 1 to `max` stars.',
  kind: 'field',
  props: {
    label: { type: { kind: 'string' }, required: true, description: 'Label.' },
    description: { type: { kind: 'string' }, description: 'Help text.' },
    max: { type: { kind: 'integer', min: 2 }, default: 5, description: 'Number of stars.' },
    required: {
      type: { kind: 'boolean' },
      default: false,
      description: 'Whether a rating is required.',
    },
  },
  value: { type: 'number', empty: null },
  events: ['change'],
  effects: ['show', 'hide', 'require', 'optional', 'clear'],
  accessibility: 'A radiogroup of star buttons; arrow keys are not implemented in this demo.',
  children: false,
  contexts: ['form', 'repeater'],
};

/** Styled only with theme tokens, so it follows the active JSON theme like the built-ins. */
function Rating({ props, value, onChange, error, required, inputRef }: FieldComponentProps) {
  const { vars } = useTheme();
  const max = typeof props['max'] === 'number' ? props['max'] : 5;
  return (
    <div className="fc-field">
      <span className="fc-label" id="rating-label">
        {String(props['label'])}
        {required ? (
          <span className="fc-required" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="rating-label"
        aria-invalid={error ? true : undefined}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}
      >
        {Array.from({ length: max }, (_, i) => {
          const selected = typeof value === 'number' && i < value;
          return (
            <button
              key={i}
              ref={i === 0 ? (inputRef as never) : undefined}
              type="button"
              role="radio"
              aria-checked={value === i + 1}
              aria-label={`${i + 1} of ${max}`}
              onClick={() => onChange(i + 1)}
              style={{
                minWidth: '2.5rem',
                minHeight: '2.5rem',
                fontSize: '1.25rem',
                color: selected ? vars.primary : vars.mutedForeground,
                background: vars.background,
                border: `1px solid ${selected ? vars.primary : vars.border}`,
                borderRadius: vars.radiusMedium,
                cursor: 'pointer',
              }}
            >
              ★
            </button>
          );
        })}
      </div>
      {error ? <p className="fc-error">{error}</p> : null}
    </div>
  );
}

// Registries are created once, at module scope.
const registry = defaultRegistry.extend([{ spec: ratingSpec, component: Rating }]);
const actions = defaultActionRegistry.extend([
  {
    spec: {
      id: 'app.fill_example',
      description: 'Fill the form with example answers.',
      events: ['click'],
      args: { name: { type: 'string', required: true, description: 'Name to fill in.' } },
      contexts: ['single', 'pages'],
      effects: 'Sets name and rating.',
    },
    run: ({ form, args }) => {
      form.setValue('name', String(args['name']));
      form.setValue('score', 4);
    },
  },
]);

const config = {
  version: 1,
  id: 'feedback',
  title: 'Rate your stay',
  components: [
    { id: 'name', type: 'text', label: 'Name' },
    { id: 'score', type: 'rating', label: 'Overall', max: 5, required: true },
    { id: 'improve', type: 'textarea', label: 'What should we improve?', required: true },
    {
      id: 'example',
      type: 'button',
      label: 'Fill with an example',
      on: { click: { action: 'app.fill_example', args: { name: 'Robin Example' } } },
    },
  ],
  layout: ['name', 'score', 'improve', 'example'],
  dependencies: [
    { when: { field: 'score', op: 'lte', value: 3 }, effect: 'show', target: 'improve' },
  ],
};

export function CustomView() {
  const submitted = useMemo(() => createValueStore<unknown>(undefined), []);
  return (
    <div className="pg-split">
      <section className="pg-panel" aria-label="Form">
        <SchemaForm
          config={config}
          registry={registry}
          actions={actions}
          onSubmit={(values) => submitted.set(values)}
        />
      </section>
      <JsonPanel title="Submitted values" store={submitted} />
    </div>
  );
}

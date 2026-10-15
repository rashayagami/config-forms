import type { ComponentSpec } from '@form-config/core';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  builtInDefinitions,
  defaultActionRegistry,
  defaultRegistry,
  SchemaForm,
  withComponent,
  type FieldComponentProps,
} from '../src/index.js';
import { renderStrict } from './helpers.js';

const ratingSpec: ComponentSpec & { readonly kind: 'field' } = {
  type: 'rating',
  description: 'Choose 1 to `max` stars.',
  kind: 'field',
  props: {
    label: { type: { kind: 'string' }, required: true, description: 'Label.' },
    max: { type: { kind: 'integer', min: 1 }, default: 5, description: 'Number of stars.' },
    required: { type: { kind: 'boolean' }, default: false, description: 'Required.' },
  },
  value: { type: 'number', empty: null },
  events: ['change'],
  effects: ['show', 'hide', 'require', 'optional'],
  accessibility: 'A radiogroup of star buttons.',
  children: false,
  contexts: ['form', 'repeater'],
};

function Rating({ props, value, onChange, error }: FieldComponentProps) {
  const max = typeof props['max'] === 'number' ? props['max'] : 5;
  return (
    <div role="radiogroup" aria-label={String(props['label'])}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          aria-label={`${i + 1} stars`}
          onClick={() => onChange(i + 1)}
        >
          ★
        </button>
      ))}
      {error ? <p>{error}</p> : null}
    </div>
  );
}

const registry = defaultRegistry.extend([{ spec: ratingSpec, component: Rating }]);

describe('custom components', () => {
  it('validates and renders a registered custom component like a built-in', async () => {
    const onSubmit = vi.fn();
    const config = {
      version: 1,
      id: 'feedback',
      components: [
        { id: 'score', type: 'rating', label: 'How was it?', max: 3, required: true },
        { id: 'why', type: 'textarea', label: 'What could be better?' },
      ],
      layout: ['score', 'why'],
      dependencies: [
        { when: { field: 'score', op: 'lt', value: 3 }, effect: 'show', target: 'why' },
      ],
    };
    const { user } = renderStrict(
      <SchemaForm config={config} registry={registry} onSubmit={onSubmit} />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '2 stars' }));
    expect(
      await screen.findByRole('textbox', { name: /What could be better/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ score: 2, why: '' }, expect.anything()),
    );
  });

  it('cannot use a custom type with a registry that lacks it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = {
      version: 1,
      id: 'f',
      components: [{ id: 'score', type: 'rating', label: 'X' }],
      layout: ['score'],
    };
    expect(() => renderStrict(<SchemaForm config={config} onSubmit={() => {}} />)).toThrow(
      'Unknown component type "rating"',
    );
  });

  it('replaces a built-in look without forking the renderer', () => {
    const text = builtInDefinitions['text'];
    if (!text || text.spec.kind !== 'field') throw new Error('missing');
    const Plain = ({ props, value, onChange }: FieldComponentProps) => (
      <label>
        {String(props['label'])}
        <input
          data-testid="plain"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
    const custom = defaultRegistry.extend([withComponent(text, Plain)], { override: true });
    expect(() => defaultRegistry.extend([withComponent(text, Plain)])).toThrow(
      'already registered',
    );
    renderStrict(
      <SchemaForm
        config={{
          version: 1,
          id: 'f',
          components: [{ id: 'a', type: 'text', label: 'A' }],
          layout: ['a'],
        }}
        registry={custom}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId('plain')).toBeInTheDocument();
  });
});

describe('registered actions', () => {
  it('runs an application action from a component event with typed arguments', async () => {
    const seen = vi.fn();
    const actions = defaultActionRegistry.extend([
      {
        spec: {
          id: 'app.fill_example',
          description: 'Fill the form with an example.',
          events: ['click'],
          args: { name: { type: 'string', required: true, description: 'Name to use.' } },
          contexts: ['single', 'pages'],
          effects: 'Sets the name field.',
        },
        run: ({ form, args, componentId }) => {
          form.setValue('name', String(args['name']));
          seen(componentId);
        },
      },
    ]);
    const config = {
      version: 1,
      id: 'f',
      components: [
        { id: 'name', type: 'text', label: 'Name' },
        {
          id: 'example',
          type: 'button',
          label: 'Use an example',
          on: { click: { action: 'app.fill_example', args: { name: 'Example Person' } } },
        },
      ],
      layout: ['name', 'example'],
    };
    const { user } = renderStrict(
      <SchemaForm config={config} actions={actions} onSubmit={() => {}} />,
    );
    await user.click(screen.getByRole('button', { name: 'Use an example' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Example Person'),
    );
    expect(seen).toHaveBeenCalledWith('example');
  });

  it('runs form.validate from a button', async () => {
    const config = {
      version: 1,
      id: 'f',
      components: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        {
          id: 'check',
          type: 'button',
          label: 'Check answers',
          on: { click: { action: 'form.validate' } },
        },
      ],
      layout: ['name', 'check'],
    };
    const { user } = renderStrict(<SchemaForm config={config} onSubmit={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  });
});

describe('render isolation', () => {
  const renders = new Map<string, number>();
  function CountingText({ inputRef, ...field }: FieldComponentProps) {
    // Counting renders is the purpose of this component.
    renders.set(field.name, (renders.get(field.name) ?? 0) + 1);
    return (
      <label>
        {String(field.props['label'])}
        <input
          value={String(field.value ?? '')}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          ref={inputRef as never}
        />
      </label>
    );
  }

  it('re-renders only the edited field and the fields that depend on it', async () => {
    const text = builtInDefinitions['text'];
    if (!text || text.spec.kind !== 'field') throw new Error('missing');
    const counting = defaultRegistry.extend([withComponent(text, CountingText)], {
      override: true,
    });
    const fields = Array.from({ length: 50 }, (_, i) => ({
      id: `f${i}`,
      type: 'text',
      label: `Field ${i}`,
    }));
    const config = {
      version: 1,
      id: 'big',
      components: [...fields, { id: 'dependent', type: 'text', label: 'Dependent' }],
      layout: [...fields.map((f) => f.id), 'dependent'],
      dependencies: [
        { when: { field: 'f0', op: 'filled' }, effect: 'require', target: 'dependent' },
      ],
    };
    const { user } = renderStrict(
      <SchemaForm config={config} registry={counting} onSubmit={() => {}} />,
    );
    const before = new Map(renders);
    await user.type(screen.getByRole('textbox', { name: 'Field 0' }), 'abc');
    const changed = [...renders]
      .filter(([name, count]) => count !== before.get(name))
      .map(([name]) => name);
    // f0 itself and "dependent", whose rule reads f0. No other field re-rendered.
    expect(changed.sort()).toEqual(['dependent', 'f0']);

    // Moving focus blurs f0, which marks it touched: a real change for f0, so focus first, then measure.
    await user.click(screen.getByRole('textbox', { name: 'Field 25' }));
    const snapshot = new Map(renders);
    await user.type(screen.getByRole('textbox', { name: 'Field 25' }), 'x');
    expect(
      [...renders].filter(([name, count]) => count !== snapshot.get(name)).map(([name]) => name),
    ).toEqual(['f25']);
  });

  it('keeps values and field identity when the parent re-renders', async () => {
    const config = {
      version: 1,
      id: 'f',
      components: [{ id: 'a', type: 'text', label: 'A' }],
      layout: ['a'],
    };
    function Parent() {
      const [count, setCount] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setCount((n) => n + 1)}>
            Rerender {count}
          </button>
          <SchemaForm config={config} onSubmit={() => {}} />
        </>
      );
    }
    const { user } = renderStrict(<Parent />);
    const input = screen.getByRole('textbox', { name: 'A' });
    await user.type(input, 'kept');
    await user.click(screen.getByRole('button', { name: 'Rerender 0' }));
    expect(screen.getByRole('button', { name: 'Rerender 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'A' })).toBe(input);
    expect(input).toHaveValue('kept');
  });
});

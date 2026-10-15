import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  applyRepairs,
  compileConfig,
  configJsonSchema,
  defaultCatalog,
  defineConfig,
  describeCatalog,
  groupIssues,
  type InferValues,
} from '../src/index.js';

describe('describeCatalog', () => {
  it('describes components, layout, conditions, effects and actions compactly', () => {
    const description = describeCatalog({
      catalog: defaultCatalog.pick(['text', 'select', 'button']),
    });
    expect(Object.keys(description.components)).toEqual(['text', 'select', 'button']);
    expect(description.sharedFieldProps?.['label']).toBe('string, required. Visible label.');
    expect(description.components['text']).toMatchObject({
      kind: 'field',
      sharedFieldProps: true,
      value: 'string, empty ""',
      events: ['change', 'blur'],
    });
    expect(
      (description.components['text'] as { props: Record<string, string> }).props['inputType'],
    ).toBe(
      '"text"|"email"|"tel"|"url"|"password"|"search", default "text". Keyboard and browser behaviour.',
    );
    expect(Object.keys(description.actions)).toContain('navigation.go_to_page');
    // Small enough to put in a prompt.
    expect(JSON.stringify(describeCatalog()).length).toBeLessThan(12_000);
  });
});

describe('configJsonSchema', () => {
  it('builds one schema per component type with only its props', () => {
    const schema = configJsonSchema({ catalog: defaultCatalog.pick(['text', 'checkbox']) }) as {
      properties: {
        components: {
          items: { oneOf: { properties: Record<string, unknown>; required: string[] }[] };
        };
      };
    };
    const [text, checkbox] = schema.properties.components.items.oneOf;
    expect(text?.properties['type']).toEqual({ const: 'text' });
    expect(text?.required).toEqual(['id', 'type', 'label']);
    expect(Object.keys(checkbox?.properties ?? {})).not.toContain('placeholder');
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

describe('targeted repair', () => {
  it('groups issues by the part to regenerate and applies a repair to just that part', () => {
    const config = {
      version: 1,
      id: 'feedback',
      components: [
        { id: 'name', type: 'text', label: 'Name' },
        { id: 'score', type: 'slider', label: 'Score' },
        { id: 'comment', type: 'textarea', label: 'Comment' },
      ],
      layout: ['name', 'score', 'comment'],
      dependencies: [
        { when: { field: 'score', op: 'lt', value: 3 }, effect: 'require', target: 'coment' },
      ],
    };
    const result = compileConfig(config);
    if (result.ok) throw new Error('expected errors');
    const groups = groupIssues(config, result.errors);
    expect(groups.map((g) => g.path)).toEqual(['/components/1', '/dependencies/0']);
    expect(groups[0]?.fragment).toEqual({ id: 'score', type: 'slider', label: 'Score' });

    const repaired = applyRepairs(config, [
      {
        path: '/components/1',
        value: { id: 'score', type: 'number', label: 'Score', min: 1, max: 5 },
      },
      { path: '/dependencies/0/target', value: 'comment' },
    ]);
    expect(config.components[1]?.type).toBe('slider');
    const fixed = compileConfig(repaired);
    expect(fixed.ok ? [] : fixed.errors).toEqual([]);
  });

  it('refuses unsafe or impossible repairs', () => {
    expect(() => applyRepairs({ a: 1 }, [{ path: '/__proto__', value: 1 }])).toThrow();
    expect(() => applyRepairs({ a: 1 }, [{ path: '/a/b', value: 1 }])).toThrow('Nothing to repair');
    expect(
      applyRepairs({ list: [1, 2] }, [{ path: '/list/0' }, { path: '/list/-', value: 3 }]),
    ).toEqual({ list: [2, 3] });
  });
});

describe('InferValues', () => {
  it('derives value types from a config written with defineConfig', () => {
    const config = defineConfig({
      version: 1,
      id: 'typed',
      components: [
        { id: 'name', type: 'text', label: 'Name' },
        { id: 'age', type: 'number', label: 'Age' },
        {
          id: 'size',
          type: 'select',
          label: 'Size',
          options: [
            { label: 'S', value: 's' },
            { label: 'L', value: 'l' },
          ],
        },
        {
          id: 'tags',
          type: 'checkbox-group',
          label: 'Tags',
          options: [{ label: 'A', value: 'a' }],
        },
        { id: 'kids', type: 'repeater', label: 'Kids', item: ['kidName'] },
        { id: 'kidName', type: 'text', label: 'Name' },
        { id: 'intro', type: 'paragraph', text: 'Hello' },
      ],
      layout: ['name', 'age', 'size', 'tags', 'kids', 'intro'],
    });
    expectTypeOf<InferValues<typeof config>>().toEqualTypeOf<{
      name: string;
      age: number | null;
      size: 's' | 'l' | null;
      tags: 'a'[];
      kids: { kidName: string }[];
    }>();
    expect(compileConfig(config).ok).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { compileConfig, defaultCatalog, SINGLE_PAGE_ID, type ConfigIssue } from '../src/index.js';
import {
  base,
  compiled,
  errorsOf,
  eventRegistration,
  petAdoption,
  tripBooking,
} from './helpers.js';

const codes = (issues: readonly ConfigIssue[]) => issues.map((issue) => issue.code);

describe('compileConfig: valid configurations', () => {
  it.each([
    ['event registration', eventRegistration],
    ['pet adoption', petAdoption],
    ['trip booking', tripBooking],
  ])('compiles the %s example', (_name, config) => {
    const result = compileConfig(config);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('normalizes a compact single-page config into the complete runtime form', () => {
    const result = compileConfig(base());
    if (!result.ok) throw new Error('invalid');
    const { config } = result;
    expect(config.mode).toBe('single');
    expect(config.pages).toEqual([
      {
        id: SINGLE_PAGE_ID,
        layout: [
          { kind: 'component', id: 'name' },
          { kind: 'component', id: 'kind' },
        ],
        submission: null,
        fields: ['name', 'kind'],
      },
    ]);
    // Defaults from the catalog are filled in; nothing unasked for is invented.
    expect(config.components[0]).toEqual({
      id: 'name',
      type: 'text',
      kind: 'field',
      props: {
        label: 'Name',
        required: false,
        disabled: false,
        readOnly: false,
        inputType: 'text',
      },
      on: {},
      value: { type: 'string', empty: '' },
      page: SINGLE_PAGE_ID,
      repeater: null,
      parent: SINGLE_PAGE_ID,
    });
    expect(config.components[1]?.props['placeholder']).toBe('Select…');
    expect(config.initialValues).toEqual({ name: '', kind: null });
    expect(config.submission).toEqual({
      strategy: 'final',
      handler: null,
      payload: 'page',
      advanceOnSuccess: true,
      requireStepSubmission: true,
    });
    expect(config.navigation.progress).toBe('steps');
    expect(config.validateOn).toBe('submit');
    expect(config.hiddenValues).toBe('omit');
  });

  it('is deterministic: the same input compiles to an identical normalized config', () => {
    const a = compileConfig(structuredClone(petAdoption));
    const b = compileConfig(structuredClone(petAdoption));
    if (!a.ok || !b.ok) throw new Error('invalid');
    expect(JSON.stringify(a.config)).toBe(JSON.stringify(b.config));
  });

  it('caches by input object and returns frozen output', () => {
    const input = base();
    const first = compileConfig(input);
    expect(compileConfig(input)).toBe(first);
    expect(compileConfig(base())).not.toBe(first);
    if (!first.ok) throw new Error('invalid');
    expect(Object.isFrozen(first.config.components[0]?.props)).toBe(true);
  });

  it('parses a JSON string', () => {
    expect(compileConfig(JSON.stringify(base())).ok).toBe(true);
    expect(codes(errorsOf('{"version": 1,'))).toEqual(['invalid_json']);
  });

  it('builds repeater rows from minItems and initial values', () => {
    const form = compiled(tripBooking);
    expect(form.config.initialValues['travellers']).toEqual([
      { travellerName: '', travellerAge: null },
    ]);
    expect(form.config.initialValues['nights']).toBe(3);
    expect(form.createRow('travellers')).toEqual({ travellerName: '', travellerAge: null });
    expect(form.itemFields('travellers')).toEqual(['travellerName', 'travellerAge']);
    expect(form.config.pages.find((p) => p.id === 'people')?.fields).toEqual(['travellers']);
  });

  it('gives generated ids to anonymous layout nodes', () => {
    const form = compiled(eventRegistration);
    const ids = form.config.pages[0]?.layout.map((item) => item.id);
    expect(ids).toEqual(['#main.0', '#main.1', 'extras', 'terms']);
  });

  it('normalizes per-page submissions with defaults', () => {
    const form = compiled(petAdoption);
    expect(form.config.pages.map((p) => p.submission)).toEqual([
      { handler: 'shelter.saveApplicant', payload: 'page', label: 'Save and continue' },
      { handler: 'shelter.saveHome', payload: 'all', label: 'Save and continue' },
      null,
      { handler: 'shelter.submitApplication', payload: 'all', label: 'Send application' },
    ]);
  });
});

describe('compileConfig: structured errors', () => {
  it('rejects unsupported versions', () => {
    const [issue] = errorsOf(base({ version: 2 }));
    expect(issue).toMatchObject({
      code: 'unsupported_version',
      path: '/version',
      suggestion: 'Set "version": 1.',
    });
  });

  it('reports an unknown component type with the closest registered type', () => {
    const issues = errorsOf(
      base({ components: [{ id: 'name', type: 'txt', label: 'Name' }], layout: ['name'] }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unknown_component_type',
        path: '/components/0/type',
        componentId: 'name',
        target: { kind: 'component', id: 'name', index: 0 },
        suggestion: 'Did you mean "text"?',
      }),
    ]);
    expect(issues[0]?.expected).toContain('"checkbox-group"');
  });

  it('rejects props the catalog does not declare, suggesting the intended one', () => {
    const [issue] = errorsOf(
      base({
        components: [{ id: 'name', type: 'text', label: 'Name', requird: true }],
        layout: ['name'],
      }),
    );
    expect(issue).toMatchObject({
      code: 'unknown_property',
      path: '/components/0/requird',
      suggestion: 'Did you mean "required"?',
    });
  });

  it('checks required props, prop types and enum values', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'a', type: 'text' },
          { id: 'b', type: 'text', label: 'B', maxLength: -1, inputType: 'emial' },
          { id: 'c', type: 'select', label: 'C', options: [] },
        ],
        layout: ['a', 'b', 'c'],
      }),
    );
    expect(issues.map((i) => [i.code, i.path, i.suggestion])).toEqual([
      ['missing_property', '/components/0/label', undefined],
      ['invalid_prop', '/components/1/maxLength', undefined],
      ['invalid_prop', '/components/1/inputType', 'Did you mean "email"?'],
      ['invalid_prop', '/components/2/options', undefined],
    ]);
  });

  it('checks default values against the value type and options', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'n', type: 'number', label: 'N', defaultValue: '3' },
          {
            id: 's',
            type: 'select',
            label: 'S',
            options: [{ label: 'A', value: 'a' }],
            defaultValue: 'z',
          },
        ],
        layout: ['n', 's'],
      }),
    );
    expect(issues.map((i) => [i.path, i.expected])).toEqual([
      ['/components/0/defaultValue', 'a number or null'],
      ['/components/1/defaultValue', 'null or one of "a"'],
    ]);
  });

  it('rejects duplicate ids and invalid ids', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'name', type: 'text', label: 'A' },
          { id: 'name', type: 'text', label: 'B' },
          { id: 'first-name', type: 'text', label: 'C' },
        ],
        layout: ['name'],
      }),
    );
    expect(codes(issues)).toEqual(['duplicate_id', 'invalid_id']);
    expect(issues[1]?.suggestion).toBe('Use "firstName".');
  });

  it('validates layout references, placement and nesting', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'a', type: 'text', label: 'A' },
          { id: 'b', type: 'text', label: 'B' },
          { id: 'c', type: 'text', label: 'C' },
        ],
        layout: [
          'a',
          'a',
          'x',
          { type: 'row', children: [{ type: 'section', children: ['b'] }] },
          { type: 'stack', children: ['c'] },
        ],
      }),
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['duplicate_placement', '/layout/1'],
      ['unknown_reference', '/layout/2'],
      ['invalid_nesting', '/layout/3/children/0/type'],
      ['invalid_layout', '/layout/4/type'],
      ['unplaced_component', '/components/2'],
    ]);
    expect(issues[3]?.suggestion).toBe('Did you mean "column"?');
  });

  it('rejects nested repeaters and controls inside repeater items', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'outer', type: 'repeater', label: 'Outer', item: ['inner', 'go'] },
          { id: 'inner', type: 'repeater', label: 'Inner', item: ['x'] },
          { id: 'x', type: 'text', label: 'X' },
          { id: 'go', type: 'button', label: 'Go' },
        ],
        layout: ['outer'],
      }),
    );
    expect(codes(issues)).toEqual([
      'invalid_context',
      'invalid_nesting',
      'invalid_context',
      'unplaced_component',
    ]);
  });

  it('requires exactly one of layout and pages, and navigation only with pages', () => {
    expect(codes(errorsOf(base({ layout: undefined })))).toEqual(['missing_property']);
    expect(codes(errorsOf(base({ pages: [{ id: 'p', layout: ['name', 'kind'] }] })))).toContain(
      'invalid_layout',
    );
    expect(codes(errorsOf(base({ navigation: { progress: 'bar' } })))).toEqual([
      'unknown_property',
    ]);
  });

  it('rejects page ids that collide with component ids', () => {
    const issues = errorsOf(
      base({ layout: undefined, pages: [{ id: 'name', layout: ['name', 'kind'] }] }),
    );
    expect(codes(issues)).toContain('duplicate_id');
  });

  it('rejects initial values for unknown fields or of the wrong type', () => {
    const issues = errorsOf(base({ initialValues: { name: 3, nmae: 'x', kind: 'zzz' } }));
    expect(issues.map((i) => [i.code, i.path, i.suggestion])).toEqual([
      ['unknown_reference', '/initialValues/nmae', 'Did you mean "name"?'],
      ['invalid_value', '/initialValues/name', undefined],
      ['invalid_value', '/initialValues/kind', undefined],
    ]);
  });
});

describe('compileConfig: dependencies', () => {
  const dep = (dependencies: unknown[], extra: Record<string, unknown> = {}) =>
    base({ dependencies, ...extra });

  it('rejects unknown sources, targets, operators and effects', () => {
    const issues = errorsOf(
      dep([
        { when: { field: 'nam', op: 'filled' }, effect: 'show', target: 'kind' },
        { when: { field: 'name', op: 'equals', value: 'x' }, effect: 'show', target: 'kind' },
        { when: { field: 'name', op: 'filled' }, effect: 'reveal', target: 'kind' },
        { when: { field: 'name', op: 'filled' }, effect: 'show', target: 'knd' },
      ]),
    );
    expect(issues.map((i) => [i.code, i.path, i.suggestion])).toEqual([
      ['unknown_reference', '/dependencies/0/when/field', 'Did you mean "name"?'],
      ['invalid_condition', '/dependencies/1/when/op', 'Did you mean "eq"?'],
      ['unsupported_effect', '/dependencies/2/effect', 'Did you mean "show"?'],
      ['unknown_reference', '/dependencies/3/target', 'Did you mean "kind"?'],
    ]);
  });

  it('checks condition operands against the field type and options', () => {
    const issues = errorsOf(
      dep([
        { when: { field: 'kind', op: 'eq', value: 'c' }, effect: 'hide', target: 'name' },
        { when: { field: 'name', op: 'gt', value: 3 }, effect: 'hide', target: 'kind' },
      ]),
    );
    expect(issues.map((i) => i.expected)).toEqual([
      'one of "a", "b"',
      'a number or date field (comparisons apply only to them)',
    ]);
  });

  it('rejects effects a target does not support, and missing effect arguments', () => {
    const issues = errorsOf(
      dep([
        {
          when: { field: 'kind', op: 'eq', value: 'a' },
          effect: 'options',
          target: 'name',
          options: [{ label: 'x', value: 'x' }],
        },
        { when: { field: 'kind', op: 'eq', value: 'a' }, effect: 'set', target: 'name' },
        { when: { field: 'kind', op: 'eq', value: 'a' }, effect: 'set', target: 'name', value: 5 },
      ]),
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['unsupported_effect', '/dependencies/0/effect'],
      ['missing_property', '/dependencies/1/value'],
      ['invalid_value', '/dependencies/2/value'],
    ]);
  });

  it('rejects a component hiding itself or the container of its own source', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'a', type: 'switch', label: 'A' },
          { id: 'b', type: 'text', label: 'B' },
        ],
        layout: [{ type: 'section', id: 'box', title: 'Box', children: ['a'] }, 'b'],
        dependencies: [
          { when: { field: 'a', op: 'eq', value: true }, effect: 'hide', target: 'a' },
          { when: { field: 'a', op: 'eq', value: true }, effect: 'hide', target: 'box' },
        ],
      }),
    );
    expect(codes(issues)).toEqual(['self_dependency', 'self_dependency']);
  });

  it('detects cycles among value effects', () => {
    const issues = errorsOf(
      dep([
        { when: { field: 'name', op: 'filled' }, effect: 'set', target: 'kind', value: 'a' },
        { when: { field: 'kind', op: 'eq', value: 'a' }, effect: 'clear', target: 'name' },
      ]),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'dependency_cycle',
        message: 'Value effects form a cycle: name → kind → name',
      }),
    ]);
  });

  it('warns about contradictory state effects but compiles', () => {
    const result = compileConfig(
      dep([
        { when: { field: 'kind', op: 'eq', value: 'a' }, effect: 'show', target: 'name' },
        { when: { field: 'kind', op: 'eq', value: 'b' }, effect: 'hide', target: 'name' },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.message)).toEqual([
      '"name" has both "show" and "hide" rules; when both hold, hide wins',
    ]);
  });

  it('scopes rules on repeater rows and rejects ambiguous row references', () => {
    const repeater = (dependencies: unknown[]) =>
      base({
        components: [
          { id: 'rows', type: 'repeater', label: 'Rows', item: ['qty', 'note'] },
          { id: 'qty', type: 'number', label: 'Qty' },
          { id: 'note', type: 'text', label: 'Note' },
          { id: 'total', type: 'text', label: 'Total' },
        ],
        layout: ['rows', 'total'],
        dependencies,
      });
    const form = compiled(
      repeater([{ when: { field: 'qty', op: 'gt', value: 5 }, effect: 'show', target: 'note' }]),
    );
    expect(form.config.dependencies[0]?.scope).toBe('rows');
    const issues = errorsOf(
      repeater([{ when: { field: 'qty', op: 'gt', value: 5 }, effect: 'show', target: 'total' }]),
    );
    expect(codes(issues)).toEqual(['ambiguous_row_reference']);
  });

  it('lets pages and identified layout nodes be targets, but only of show and hide', () => {
    const form = compiled(petAdoption);
    expect(form.rulesFor('homeVisit').map((r) => r.effect)).toEqual(['show']);
    const issues = errorsOf(
      base({
        layout: [{ type: 'group', id: 'g', title: 'G', children: ['name', 'kind'] }],
        dependencies: [{ when: { field: 'name', op: 'filled' }, effect: 'disable', target: 'g' }],
      }),
    );
    expect(issues[0]).toMatchObject({ code: 'unsupported_effect', expected: '"show", "hide"' });
  });
});

describe('compileConfig: actions', () => {
  const withButton = (on: unknown, extra: Record<string, unknown> = {}) =>
    base({
      components: [
        { id: 'name', type: 'text', label: 'Name' },
        { id: 'go', type: 'button', label: 'Go', on },
      ],
      layout: ['name', 'go'],
      ...extra,
    });

  it('accepts a registered action on a supported event', () => {
    const form = compiled(withButton({ click: { action: 'form.reset' } }));
    expect(form.components.get('go')?.on).toEqual({ click: { action: 'form.reset', args: {} } });
  });

  it('rejects unknown actions and events, with suggestions', () => {
    const issues = errorsOf(
      withButton({ click: { action: 'form.rest' }, press: { action: 'form.reset' } }),
    );
    expect(issues.map((i) => [i.code, i.suggestion])).toEqual([
      ['unknown_action', 'Did you mean "form.reset"?'],
      ['unknown_event', 'Did you mean "click"?'],
    ]);
  });

  it('rejects navigation actions in a single-page form and checks page arguments', () => {
    expect(codes(errorsOf(withButton({ click: { action: 'navigation.next' } })))).toEqual([
      'invalid_action_context',
    ]);
    const pages = (args: unknown) =>
      withButton(
        { click: { action: 'navigation.go_to_page', args } },
        { layout: undefined, pages: [{ id: 'first', layout: ['name', 'go'] }] },
      );
    expect(compileConfig(pages({ page: 'first' })).ok).toBe(true);
    expect(errorsOf(pages({ page: 'frist' }))[0]).toMatchObject({
      code: 'invalid_action_args',
      suggestion: 'Did you mean "first"?',
    });
    expect(errorsOf(pages({}))[0]).toMatchObject({
      code: 'invalid_action_args',
      message: '"navigation.go_to_page" needs "page"',
    });
    expect(errorsOf(pages({ page: 'first', extra: 1 }))[0]).toMatchObject({
      code: 'invalid_action_args',
    });
  });

  it('only allows actions on display components that declare events', () => {
    const issues = errorsOf(
      base({
        components: [
          { id: 'h', type: 'heading', text: 'Hi', on: { click: { action: 'form.reset' } } },
          { id: 'name', type: 'text', label: 'N' },
        ],
        layout: ['h', 'name'],
      }),
    );
    expect(issues[0]).toMatchObject({ code: 'unknown_event', expected: 'no events' });
  });
});

describe('compileConfig: submission strategy', () => {
  const pages = (extra: Record<string, unknown>, pageExtra: Record<string, unknown>[] = [{}, {}]) =>
    base({
      layout: undefined,
      pages: [
        { id: 'one', layout: ['name'], ...pageExtra[0] },
        { id: 'two', layout: ['kind'], ...pageExtra[1] },
      ],
      ...extra,
    });

  it('defaults to a final submission delivered to the application', () => {
    expect(compiled(pages({})).config.submission.strategy).toBe('final');
  });

  it('rejects page submissions under the final strategy', () => {
    const issues = errorsOf(
      pages({ submission: { strategy: 'final', handler: 'app.submit' } }, [
        { submission: { handler: 'app.one' } },
        {},
      ]),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'incompatible_submission',
        path: '/pages/0/submission',
        pageId: 'one',
        target: { kind: 'page', id: 'one', index: 0 },
      }),
    ]);
  });

  it('rejects perStep-only settings under the final strategy', () => {
    expect(codes(errorsOf(pages({ submission: { strategy: 'final', payload: 'all' } })))).toEqual([
      'incompatible_submission',
    ]);
  });

  it('rejects perStep in a single-page form', () => {
    expect(errorsOf(base({ submission: { strategy: 'perStep' } }))[0]).toMatchObject({
      code: 'incompatible_submission',
      path: '/submission/strategy',
    });
  });

  it('rejects a form handler that the always-present last page would shadow', () => {
    const issues = errorsOf(
      pages({ submission: { strategy: 'perStep', handler: 'app.final' } }, [
        {},
        { submission: { handler: 'app.two' } },
      ]),
    );
    expect(codes(issues)).toEqual(['unused_handler']);
  });

  it('checks handler names against the registered handlers when given', () => {
    const config = pages({ submission: { strategy: 'perStep' } }, [
      { submission: { handler: 'app.saveOne' } },
      { submission: { handler: 'app.final' } },
    ]);
    expect(compileConfig(config, { handlers: ['app.saveOne', 'app.final'] }).ok).toBe(true);
    const issues = errorsOf(config, { handlers: ['app.save_one', 'app.final'] });
    expect(issues[0]).toMatchObject({
      code: 'unknown_handler',
      pageId: 'one',
      suggestion: 'Did you mean "app.save_one"?',
    });
  });

  it('requires a handler in a page submission', () => {
    expect(
      codes(errorsOf(pages({ submission: { strategy: 'perStep' } }, [{ submission: {} }, {}]))),
    ).toEqual(['missing_property']);
  });
});

describe('catalog', () => {
  it('rejects duplicate registration unless overriding', () => {
    const spec = defaultCatalog.get('text');
    if (!spec) throw new Error('missing');
    expect(() => defaultCatalog.extend([spec])).toThrow('already registered');
    expect(
      defaultCatalog.extend([{ ...spec, description: 'Mine' }], { override: true }).get('text')
        ?.description,
    ).toBe('Mine');
    expect(defaultCatalog.get('text')?.description).not.toBe('Mine');
  });

  it('validates custom components through their own spec', () => {
    const catalog = defaultCatalog.extend([
      {
        type: 'rating',
        description: 'Stars from 1 to max.',
        kind: 'field',
        props: {
          label: { type: { kind: 'string' }, required: true, description: 'Label.' },
          max: { type: { kind: 'integer', min: 1 }, default: 5, description: 'Stars.' },
          required: { type: { kind: 'boolean' }, default: false, description: 'Required.' },
        },
        value: { type: 'number', empty: null },
        events: ['change'],
        effects: ['show', 'hide'],
        accessibility: 'Radio group.',
        children: false,
        contexts: ['form'],
      },
    ]);
    const config = base({
      components: [{ id: 'stars', type: 'rating', label: 'Rate us', max: 0 }],
      layout: ['stars'],
    });
    expect(errorsOf(config, { catalog })[0]).toMatchObject({
      code: 'invalid_prop',
      expected: 'an integer of at least 1',
    });
    expect(errorsOf(config)[0]).toMatchObject({ code: 'unknown_component_type' });
    const ok = compiled(
      base({ components: [{ id: 'stars', type: 'rating', label: 'Rate us' }], layout: ['stars'] }),
      { catalog },
    );
    expect(ok.components.get('stars')?.props['max']).toBe(5);
  });
});

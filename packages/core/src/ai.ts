/**
 * Helpers for an application that generates configurations with a model. The
 * library calls no model: these functions describe what a configuration may
 * contain, and support repairing part of an invalid one.
 */
import {
  defaultActions,
  defaultCatalog,
  type ActionCatalog,
  type Catalog,
  type PropSpec,
  type PropType,
} from './catalog.js';
import type { ConfigIssue, IssueTarget } from './issues.js';
import { cloneJson, isPlainObject } from './values.js';

const LAYOUT_GRAMMAR = {
  column: 'Stacks children vertically. Children: ids, row, grid, group.',
  row: 'Places children side by side on wide screens; stacks on narrow ones. Children: ids, column, group.',
  grid: 'Equal columns ("columns": 2-4). Children: ids, column, group.',
  section:
    'A titled region ("title", "description"). Top level only. Children: ids, group, column, row, grid.',
  group: 'Related fields under a legend ("title"). Children: ids, column, row, grid.',
};

function describeProp(spec: PropSpec): string {
  const t = spec.type;
  const typeText: Record<PropType['kind'], () => string> = {
    string: () => 'string',
    number: () => 'number',
    integer: () =>
      t.kind === 'integer' && t.min !== undefined ? `integer >= ${t.min}` : 'integer',
    boolean: () => 'boolean',
    enum: () => (t.kind === 'enum' ? t.values.map((v) => JSON.stringify(v)).join('|') : ''),
    date: () => 'date "YYYY-MM-DD"',
    regex: () => 'regex string (whole value must match)',
    options: () =>
      t.kind === 'options' && t.valueKind === 'string'
        ? '[{label, value: string}]'
        : '[{label, value: string|number}]',
    fieldRef: () => 'id of another field',
    validatorRef: () => 'registered validator name',
    messages: () => '{constraint: message}',
    layout: () => 'layout array',
    value: () => "value of this component's type",
    json: () => 'any JSON',
  };
  let text = typeText[t.kind]();
  if (spec.required) text += ', required';
  if (spec.default !== undefined) text += `, default ${JSON.stringify(spec.default)}`;
  return `${text}. ${spec.description}`;
}

export interface DescribeOptions {
  readonly catalog?: Catalog;
  readonly actions?: ActionCatalog;
  /** Leave out the props shared by every field (label, required, ...) from each entry and list them once. */
  readonly compact?: boolean;
}

/**
 * A compact, JSON-serializable description of what a configuration may use,
 * for a model's prompt. Pass a catalog trimmed with `catalog.pick([...])` to
 * keep it to the components a task needs.
 */
export function describeCatalog(options: DescribeOptions = {}) {
  const catalog = options.catalog ?? defaultCatalog;
  const actions = options.actions ?? defaultActions;
  const shared = [
    'label',
    'description',
    'required',
    'disabled',
    'readOnly',
    'defaultValue',
    'validator',
    'messages',
  ];
  const compact = options.compact ?? true;
  const fieldTypes = catalog.toJSON().filter((spec) => spec.kind === 'field');
  const sharedProps: Record<string, string> = {};
  if (compact && fieldTypes.length > 0) {
    for (const name of shared) {
      const spec = fieldTypes[0]?.props[name];
      if (spec && fieldTypes.every((f) => f.props[name])) sharedProps[name] = describeProp(spec);
    }
  }
  const components: Record<string, unknown> = {};
  for (const spec of catalog.toJSON()) {
    const props: Record<string, string> = {};
    for (const [name, prop] of Object.entries(spec.props)) {
      if (spec.kind === 'field' && sharedProps[name]) continue;
      props[name] = describeProp(prop);
    }
    components[spec.type] = {
      description: spec.description,
      kind: spec.kind,
      ...(spec.kind === 'field' && Object.keys(sharedProps).length
        ? { sharedFieldProps: true }
        : {}),
      props,
      ...(spec.value
        ? { value: `${spec.value.type}, empty ${JSON.stringify(spec.value.empty)}` }
        : {}),
      ...(spec.events.length ? { events: spec.events } : {}),
      effects: spec.effects,
      ...(spec.contexts.includes('repeater') ? {} : { notInRepeater: true }),
    };
  }
  const actionList: Record<string, unknown> = {};
  for (const spec of actions.toJSON()) {
    actionList[spec.id] = {
      description: spec.description,
      events: spec.events,
      ...(Object.keys(spec.args).length
        ? {
            args: Object.fromEntries(
              Object.entries(spec.args).map(([k, a]) => [
                k,
                `${a.type}${a.required ? ', required' : ''}. ${a.description}`,
              ]),
            ),
          }
        : {}),
      ...(spec.contexts.length === 1
        ? { only: spec.contexts[0] === 'pages' ? 'multi-page forms' : 'single-page forms' }
        : {}),
    };
  }
  return {
    format: [
      'Root: { "version": 1, "id", "components": [...], and either "layout": [...] (one page) or "pages": [{ "id", "title", "layout": [...] }] }.',
      'Each component: { "id": identifier, "type": catalog type, ...its props }. For fields the id is also the value key.',
      'Layout arrays hold component ids (each placed exactly once) and layout nodes { "type", "children": [...] }.',
      'Optional: "dependencies": [{ "when": condition, "effect", "target": id or [ids], "value" (set), "options" (options) }].',
      'Optional: component "on": { "<event>": { "action": "<action id>", "args": {...} } }.',
      'Optional: "submission": { "strategy": "final" | "perStep", "handler" }; with perStep, pages may have "submission": { "handler" }.',
      'Optional: "initialValues": { "<field id>": value }, "navigation": { "progress", "allowBack", "validateOnNext" }.',
      'Do not write styling, HTML, code or props that are not listed.',
    ],
    ...(Object.keys(sharedProps).length ? { sharedFieldProps: sharedProps } : {}),
    components,
    layout: LAYOUT_GRAMMAR,
    conditions:
      '{ "field": id, "op": "eq"|"neq"|"in"|"notIn"|"gt"|"gte"|"lt"|"lte"|"includes"|"filled"|"empty", "value" } or { "all": [...] } | { "any": [...] } | { "not": {...} }. Inside a repeater item, a field of the same item means the same row.',
    effects: {
      show: 'Visible only while the condition holds.',
      hide: 'Hidden while the condition holds (wins over show).',
      enable: 'Enabled only while the condition holds.',
      disable: 'Disabled while the condition holds (wins over enable).',
      require: 'Required while the condition holds.',
      optional: 'Not required while the condition holds (wins over require).',
      options: 'Uses "options" while the condition holds (first matching rule wins).',
      clear: 'Empties the target each time the condition becomes true.',
      set: 'Writes "value" to the target each time the condition becomes true.',
    },
    actions: actionList,
  };
}

// ---------------------------------------------------------------------------
// JSON Schema for structured output
// ---------------------------------------------------------------------------

type Schema = Record<string, unknown>;

function propSchema(spec: PropSpec): Schema {
  const t = spec.type;
  const description = spec.description;
  switch (t.kind) {
    case 'string':
    case 'fieldRef':
    case 'validatorRef':
      return { type: 'string', description };
    case 'number':
      return { type: 'number', description };
    case 'integer':
      return { type: 'integer', ...(t.min !== undefined ? { minimum: t.min } : {}), description };
    case 'boolean':
      return { type: 'boolean', description };
    case 'enum':
      return { enum: [...t.values], description };
    case 'date':
      return { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description };
    case 'regex':
      return { type: 'string', maxLength: 500, description };
    case 'options':
      return {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: t.valueKind === 'string' ? { type: 'string' } : { type: ['string', 'number'] },
            description: { type: 'string' },
            disabled: { type: 'boolean' },
          },
          required: ['label', 'value'],
          additionalProperties: false,
        },
        description,
      };
    case 'messages':
      return { type: 'object', additionalProperties: { type: 'string' }, description };
    case 'layout':
      return { $ref: '#/$defs/layout', description };
    case 'value':
    case 'json':
      return { description };
  }
}

/**
 * A JSON Schema (2020-12) of the authoring format for the given catalog and
 * actions, for structured-output APIs. It narrows what a model can emit; the
 * compiler still checks everything the schema cannot express (references,
 * placement, cycles), so always compile the result.
 */
export function configJsonSchema(
  options: { readonly catalog?: Catalog; readonly actions?: ActionCatalog } = {},
): Schema {
  const catalog = options.catalog ?? defaultCatalog;
  const actions = options.actions ?? defaultActions;
  const id = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]*$' };
  const actionCall = (event: string): Schema => ({
    oneOf: actions
      .toJSON()
      .filter((spec) => spec.events.includes(event))
      .map((spec) => ({
        type: 'object',
        properties: {
          action: { const: spec.id },
          args: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(spec.args).map(([k, a]) => [
                k,
                { type: a.type === 'pageId' || a.type === 'componentId' ? 'string' : a.type },
              ]),
            ),
            required: Object.entries(spec.args)
              .filter(([, a]) => a.required)
              .map(([k]) => k),
            additionalProperties: false,
          },
        },
        required: Object.values(spec.args).some((a) => a.required)
          ? ['action', 'args']
          : ['action'],
        additionalProperties: false,
      })),
  });
  const components = catalog.toJSON().map((spec) => ({
    type: 'object',
    description: spec.description,
    properties: {
      id,
      type: { const: spec.type },
      ...Object.fromEntries(
        Object.entries(spec.props).map(([name, prop]) => [name, propSchema(prop)]),
      ),
      ...(spec.events.length
        ? {
            on: {
              type: 'object',
              properties: Object.fromEntries(spec.events.map((e) => [e, actionCall(e)])),
              additionalProperties: false,
            },
          }
        : {}),
    },
    required: [
      'id',
      'type',
      ...Object.entries(spec.props)
        .filter(([, p]) => p.required)
        .map(([n]) => n),
    ],
    additionalProperties: false,
  }));
  const primitive = { type: ['string', 'number', 'boolean', 'null'] };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'form-config v1',
    type: 'object',
    properties: {
      version: { const: 1 },
      id,
      title: { type: 'string' },
      description: { type: 'string' },
      components: { type: 'array', minItems: 1, items: { oneOf: components } },
      layout: { $ref: '#/$defs/layout' },
      pages: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            id,
            title: { type: 'string' },
            description: { type: 'string' },
            layout: { $ref: '#/$defs/layout' },
            submission: {
              type: 'object',
              properties: {
                handler: { type: 'string' },
                payload: { enum: ['page', 'all'] },
                label: { type: 'string' },
              },
              required: ['handler'],
              additionalProperties: false,
            },
          },
          required: ['id', 'layout'],
          additionalProperties: false,
        },
      },
      navigation: {
        type: 'object',
        properties: {
          progress: { enum: ['steps', 'bar', 'none'] },
          allowBack: { type: 'boolean' },
          validateOnNext: { type: 'boolean' },
          previousLabel: { type: 'string' },
          nextLabel: { type: 'string' },
        },
        additionalProperties: false,
      },
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            when: { $ref: '#/$defs/condition' },
            effect: {
              enum: [
                'show',
                'hide',
                'enable',
                'disable',
                'require',
                'optional',
                'options',
                'clear',
                'set',
              ],
            },
            target: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' }, minItems: 1 },
              ],
            },
            value: {},
            options: propSchema({
              type: { kind: 'options', valueKind: 'string-or-number' },
              description: 'Options while the condition holds.',
            }),
          },
          required: ['when', 'effect', 'target'],
          additionalProperties: false,
        },
      },
      submission: {
        type: 'object',
        properties: {
          strategy: { enum: ['final', 'perStep'] },
          handler: { type: 'string' },
          payload: { enum: ['page', 'all'] },
          advanceOnSuccess: { type: 'boolean' },
          requireStepSubmission: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      initialValues: { type: 'object' },
      validateOn: { enum: ['submit', 'blur', 'change'] },
      hiddenValues: { enum: ['omit', 'keep'] },
      submitLabel: { type: 'string' },
      showReset: { type: 'boolean' },
    },
    required: ['version', 'id', 'components'],
    oneOf: [{ required: ['layout'] }, { required: ['pages'] }],
    additionalProperties: false,
    $defs: {
      layout: { type: 'array', minItems: 1, items: { $ref: '#/$defs/layoutItem' } },
      layoutItem: {
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              type: { enum: ['column', 'row', 'grid', 'section', 'group'] },
              id,
              title: { type: 'string' },
              description: { type: 'string' },
              columns: { enum: [2, 3, 4] },
              children: { $ref: '#/$defs/layout' },
            },
            required: ['type', 'children'],
            additionalProperties: false,
          },
        ],
      },
      condition: {
        oneOf: [
          {
            type: 'object',
            properties: {
              field: { type: 'string' },
              op: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes'] },
              value: primitive,
            },
            required: ['field', 'op', 'value'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              field: { type: 'string' },
              op: { enum: ['in', 'notIn'] },
              value: { type: 'array', items: primitive, minItems: 1 },
            },
            required: ['field', 'op', 'value'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: { field: { type: 'string' }, op: { enum: ['filled', 'empty'] } },
            required: ['field', 'op'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              all: { type: 'array', minItems: 1, items: { $ref: '#/$defs/condition' } },
            },
            required: ['all'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              any: { type: 'array', minItems: 1, items: { $ref: '#/$defs/condition' } },
            },
            required: ['any'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: { not: { $ref: '#/$defs/condition' } },
            required: ['not'],
            additionalProperties: false,
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Targeted repair
// ---------------------------------------------------------------------------

export interface RepairGroup {
  readonly target: IssueTarget;
  /** JSON Pointer of the part to regenerate, e.g. "/components/3". */
  readonly path: string;
  /** The current (invalid) fragment, to show a model alongside the issues. */
  readonly fragment: unknown;
  readonly issues: readonly ConfigIssue[];
}

function targetPath(target: IssueTarget): string {
  switch (target.kind) {
    case 'component':
      return `/components/${target.index}`;
    case 'page':
      return `/pages/${target.index}`;
    case 'dependency':
      return `/dependencies/${target.index}`;
    case 'layout':
      return '/layout';
    case 'submission':
      return '/submission';
    case 'initialValues':
      return '/initialValues';
    case 'root':
      return '';
  }
}

function decode(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Reads a JSON Pointer from a value. */
export function readPointer(value: unknown, path: string): unknown {
  if (path === '') return value;
  let current: unknown = value;
  for (const segment of path.slice(1).split('/').map(decode)) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isPlainObject(current)) current = current[segment];
    else return undefined;
  }
  return current;
}

/**
 * Groups issues by the config part they belong to (one component, one page,
 * one dependency, ...), with that part's current content, so a generator can
 * regenerate just the broken parts.
 */
export function groupIssues(config: unknown, issues: readonly ConfigIssue[]): RepairGroup[] {
  const groups = new Map<string, { target: IssueTarget; issues: ConfigIssue[] }>();
  for (const issue of issues) {
    const path = targetPath(issue.target);
    const group = groups.get(path) ?? { target: issue.target, issues: [] };
    group.issues.push(issue);
    groups.set(path, group);
  }
  return [...groups.entries()].map(([path, group]) => ({
    target: group.target,
    path,
    fragment: readPointer(config, path),
    issues: group.issues,
  }));
}

export interface Repair {
  /** JSON Pointer to replace; "/components/-" appends. */
  readonly path: string;
  /** The new value; omit to remove the value at `path`. */
  readonly value?: unknown;
}

/** Returns a copy of the config with each repair applied in order. The input is not modified. */
export function applyRepairs<T>(config: T, repairs: readonly Repair[]): T {
  const copy = cloneJson(config) as unknown;
  for (const repair of repairs) {
    if (repair.path === '') throw new Error('A repair cannot replace the whole configuration');
    const segments = repair.path.slice(1).split('/').map(decode);
    const last = segments.pop() as string;
    const parent = readPointer(copy, segments.length ? `/${segments.join('/')}` : '');
    if (Array.isArray(parent)) {
      if (last === '-') {
        if ('value' in repair) parent.push(cloneJson(repair.value));
        continue;
      }
      const index = Number(last);
      if (!Number.isInteger(index) || index < 0 || index > parent.length)
        throw new Error(`No array index "${last}" at ${repair.path}`);
      if ('value' in repair) parent[index] = cloneJson(repair.value);
      else parent.splice(index, 1);
    } else if (isPlainObject(parent)) {
      if (['__proto__', 'constructor', 'prototype'].includes(last))
        throw new Error(`Refusing to write "${last}"`);
      if ('value' in repair) parent[last] = cloneJson(repair.value);
      else Reflect.deleteProperty(parent, last);
    } else {
      throw new Error(`Nothing to repair at ${repair.path}`);
    }
  }
  return copy as T;
}

import {
  defaultActions,
  defaultCatalog,
  type ActionCatalog,
  type Catalog,
  type ComponentKind,
  type ComponentSpec,
  type PropSpec,
  type ValueSpec,
} from './catalog.js';
import { conditionFields } from './conditions.js';
import {
  SUPPORTED_CONFIG_VERSIONS,
  type Condition,
  type EffectType,
  type JsonObject,
  type JsonValue,
  type LayoutType,
  type Option,
  type SubmissionPayload,
  type SubmissionStrategy,
} from './config.js';
import {
  ConfigError,
  closest,
  pointer,
  quoteList,
  type ConfigIssue,
  type IssueCode,
  type IssueTarget,
} from './issues.js';
import { buildIndex, type CompiledForm } from './runtime.js';
import {
  BREAKPOINTS,
  resolveColumns,
  resolveResponsive,
  type Align,
  type Breakpoint,
  type Gap,
  type Justify,
  type MaxWidth,
  type Resolved,
  type Responsive,
  type StackBelow,
} from './layout.js';
import { cloneJson, isPlainObject } from './values.js';

export const COMPILER_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Normalized runtime format
// ---------------------------------------------------------------------------

export interface NormalizedActionCall {
  readonly action: string;
  readonly args: JsonObject;
}

export interface NormalizedComponent {
  readonly id: string;
  readonly type: string;
  readonly kind: ComponentKind;
  /** Every prop the config set, plus every catalog default for props it did not. */
  readonly props: { readonly [name: string]: JsonValue };
  readonly on: { readonly [event: string]: NormalizedActionCall };
  /** Value semantics of form components; null for display components and controls. */
  readonly value: ValueSpec | null;
  readonly page: string;
  /** The repeater whose item layout holds this component, or null. */
  readonly repeater: string | null;
  /** The id of the layout node, repeater or page that directly contains it. */
  readonly parent: string;
  /** For repeaters: the layout of one row. */
  readonly layout?: readonly NormalizedLayoutItem[];
}

export interface NormalizedLayoutNode {
  readonly kind: 'layout';
  /** The configured id, or a generated one starting with "#". */
  readonly id: string;
  readonly type: LayoutType;
  readonly title?: string;
  readonly description?: string;
  /** Grid only: columns per breakpoint. */
  readonly columns?: Resolved<number>;
  readonly gap: Resolved<Gap>;
  /** Row only. */
  readonly stackBelow?: StackBelow;
  readonly align?: Align;
  readonly justify?: Justify;
  readonly maxWidth: MaxWidth;
  /** Set when the node sits in a grid: columns spanned per breakpoint. */
  readonly span?: Resolved<number>;
  /** Breakpoints where the node is shown; all three unless configured. */
  readonly visibleOn: readonly Breakpoint[];
  readonly children: readonly NormalizedLayoutItem[];
}

export type NormalizedLayoutItem =
  { readonly kind: 'component'; readonly id: string } | NormalizedLayoutNode;

export interface NormalizedPageSubmission {
  readonly handler: string;
  readonly payload: SubmissionPayload;
  readonly label: string;
}

export interface NormalizedPage {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly layout: readonly NormalizedLayoutItem[];
  readonly submission: NormalizedPageSubmission | null;
  /** Ids of the form components placed on this page outside repeaters, in order. */
  readonly fields: readonly string[];
}

export interface NormalizedDependency {
  readonly index: number;
  readonly when: Condition;
  readonly effect: EffectType;
  readonly targets: readonly string[];
  readonly value?: JsonValue;
  readonly options?: readonly Option[];
  /** Component ids the condition reads. */
  readonly sources: readonly string[];
  /** When the sources are fields of one repeater's rows, that repeater; the rule then applies per row. */
  readonly scope: string | null;
}

export interface NormalizedSubmission {
  readonly strategy: SubmissionStrategy;
  readonly handler: string | null;
  readonly payload: SubmissionPayload;
  readonly advanceOnSuccess: boolean;
  readonly requireStepSubmission: boolean;
}

export interface NormalizedConfig {
  readonly compilerVersion: string;
  readonly version: 1;
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  /** `single` for a `layout` config (one implicit page "#main"), `pages` otherwise. */
  readonly mode: 'single' | 'pages';
  readonly components: readonly NormalizedComponent[];
  readonly pages: readonly NormalizedPage[];
  readonly dependencies: readonly NormalizedDependency[];
  readonly navigation: {
    readonly progress: 'steps' | 'bar' | 'none';
    readonly allowBack: boolean;
    readonly validateOnNext: boolean;
    readonly previousLabel: string;
    readonly nextLabel: string;
  };
  readonly submission: NormalizedSubmission;
  /** The complete initial values: config values over component defaults over empty values. */
  readonly initialValues: { readonly [id: string]: JsonValue };
  readonly validateOn: 'submit' | 'blur' | 'change';
  readonly hiddenValues: 'omit' | 'keep';
  readonly submitLabel: string;
  readonly showReset: boolean;
  /** The registered theme the config names, or null to use the surrounding theme. */
  readonly theme: string | null;
}

// ---------------------------------------------------------------------------
// Options and results
// ---------------------------------------------------------------------------

export interface CompileOptions {
  readonly catalog?: Catalog;
  readonly actions?: ActionCatalog;
  /** Names of the validators the application registers. When given, `validator` props are checked. */
  readonly validators?: readonly string[];
  /** Names of the submit handlers the application registers. When given, handler names are checked. */
  readonly handlers?: readonly string[];
  /** Default 2000. */
  readonly maxComponents?: number;
  /** Default 12. */
  readonly maxDepth?: number;
}

export type CompileResult =
  | {
      readonly ok: true;
      readonly config: NormalizedConfig;
      readonly form: CompiledForm;
      readonly warnings: readonly ConfigIssue[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly ConfigIssue[];
      readonly warnings: readonly ConfigIssue[];
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const HANDLER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PATTERN_LENGTH = 500;
export const SINGLE_PAGE_ID = '#main';

const ROOT_KEYS = [
  'version',
  'id',
  'title',
  'description',
  'components',
  'layout',
  'pages',
  'navigation',
  'dependencies',
  'initialValues',
  'validateOn',
  'hiddenValues',
  'submission',
  'submitLabel',
  'showReset',
  'theme',
];
const PAGE_KEYS = ['id', 'title', 'description', 'layout', 'submission'];
const LAYOUT_KEYS = [
  'type',
  'id',
  'title',
  'description',
  'columns',
  'gap',
  'stackBelow',
  'align',
  'justify',
  'maxWidth',
  'span',
  'visibleOn',
  'children',
];
const LAYOUT_TYPES: readonly LayoutType[] = ['column', 'row', 'grid', 'section', 'group'];
const NAVIGATION_KEYS = ['progress', 'allowBack', 'validateOnNext', 'previousLabel', 'nextLabel'];
const SUBMISSION_KEYS = [
  'strategy',
  'handler',
  'payload',
  'advanceOnSuccess',
  'requireStepSubmission',
];
const PAGE_SUBMISSION_KEYS = ['handler', 'payload', 'label'];
const DEPENDENCY_KEYS = ['when', 'effect', 'target', 'value', 'options'];
const EFFECTS: readonly EffectType[] = [
  'show',
  'hide',
  'enable',
  'disable',
  'require',
  'optional',
  'options',
  'clear',
  'set',
];
const VISIBILITY_EFFECTS: readonly EffectType[] = ['show', 'hide'];
const MESSAGE_KEYS = [
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'minItems',
  'maxItems',
  'pattern',
  'matches',
  'option',
  'number',
  'date',
];
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'includes', 'filled', 'empty'];

type Parent = 'root' | 'item' | LayoutType;
/** Which layout node types may appear directly inside each parent. */
const ALLOWED_CHILDREN: Record<Parent, readonly LayoutType[]> = {
  root: ['section', 'group', 'column', 'row', 'grid'],
  item: ['group', 'column', 'row', 'grid'],
  section: ['group', 'column', 'row', 'grid'],
  group: ['column', 'row', 'grid'],
  column: ['group', 'row', 'grid'],
  row: ['column', 'group'],
  grid: ['column', 'group'],
};

const cache = new WeakMap<Catalog, WeakMap<ActionCatalog, WeakMap<object, CompileResult>>>();

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

interface RawComponent {
  readonly raw: Record<string, unknown>;
  readonly index: number;
  readonly id: string;
  readonly spec: ComponentSpec | undefined;
}

interface Placement {
  readonly page: string;
  readonly repeater: string | null;
  readonly parent: string;
}

/**
 * Validates an authoring configuration and produces its normalized runtime
 * form. Every problem is reported (nothing is dropped or guessed); the result
 * is `ok: false` if any error was found. Results are cached per input object
 * and catalog, so recompiling an unchanged object is free. Treat configs as
 * immutable: a changed config must be a new object.
 */
export function compileConfig(input: unknown, options: CompileOptions = {}): CompileResult {
  const catalog = options.catalog ?? defaultCatalog;
  const actions = options.actions ?? defaultActions;
  const cacheable =
    typeof input === 'object' && input !== null && !options.validators && !options.handlers;
  if (cacheable) {
    const hit = cache.get(catalog)?.get(actions)?.get(input);
    if (hit) return hit;
  }
  const result = compileUncached(input, catalog, actions, options);
  if (cacheable) {
    let byActions = cache.get(catalog);
    if (!byActions) cache.set(catalog, (byActions = new WeakMap()));
    let byInput = byActions.get(actions);
    if (!byInput) byActions.set(actions, (byInput = new WeakMap()));
    byInput.set(input as object, result);
  }
  return result;
}

/** Like `compileConfig`, but throws a `ConfigError` listing every issue when the config is invalid. */
export function assertConfig(
  input: unknown,
  options?: CompileOptions,
): Extract<CompileResult, { ok: true }> {
  const result = compileConfig(input, options);
  if (!result.ok) throw new ConfigError([...result.errors, ...result.warnings]);
  return result;
}

function compileUncached(
  rawInput: unknown,
  catalog: Catalog,
  actions: ActionCatalog,
  options: CompileOptions,
): CompileResult {
  const maxComponents = options.maxComponents ?? 2000;
  const maxDepth = options.maxDepth ?? 12;
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const ROOT: IssueTarget = { kind: 'root' };

  const report = (
    severity: 'error' | 'warning',
    code: IssueCode,
    path: string,
    target: IssueTarget,
    message: string,
    extra: {
      expected?: string | undefined;
      suggestion?: string | undefined;
      componentId?: string | undefined;
      pageId?: string | undefined;
    } = {},
  ) => {
    const issue: Record<string, unknown> = { severity, code, path, target, message };
    for (const [key, value] of Object.entries(extra)) if (value !== undefined) issue[key] = value;
    (severity === 'error' ? errors : warnings).push(issue as unknown as ConfigIssue);
  };
  const error = (
    code: IssueCode,
    path: string,
    target: IssueTarget,
    message: string,
    extra?: Parameters<typeof report>[5],
  ) => report('error', code, path, target, message, extra);

  const fail = (): CompileResult => ({ ok: false, errors, warnings });

  // 1. Parse.
  let input: unknown = rawInput;
  if (typeof rawInput === 'string') {
    try {
      input = JSON.parse(rawInput);
    } catch (cause) {
      error(
        'invalid_json',
        '',
        ROOT,
        `The configuration is not valid JSON: ${(cause as Error).message}`,
      );
      return fail();
    }
  }
  if (!isPlainObject(input)) {
    error('invalid_type', '', ROOT, 'A configuration must be a JSON object', {
      expected: 'an object',
    });
    return fail();
  }
  const root = input;

  // 2. Version and structure.
  const version = root['version'];
  if (typeof version !== 'number' || !SUPPORTED_CONFIG_VERSIONS.includes(version)) {
    error(
      'unsupported_version',
      '/version',
      ROOT,
      `Unsupported configuration version ${JSON.stringify(version)}`,
      {
        expected: quoteList(SUPPORTED_CONFIG_VERSIONS),
        suggestion: 'Set "version": 1.',
      },
    );
    return fail();
  }

  const checkKeys = (
    obj: Record<string, unknown>,
    allowed: readonly string[],
    path: string,
    target: IssueTarget,
    extra: { componentId?: string; pageId?: string } = {},
  ) => {
    for (const key of Object.keys(obj)) {
      if (allowed.includes(key)) continue;
      const near = closest(key, allowed);
      error('unknown_property', pointer(path, key), target, `Unknown property "${key}"`, {
        ...extra,
        expected: quoteList(allowed),
        suggestion: near ? `Did you mean "${near}"?` : `Remove "${key}".`,
      });
    }
  };

  const checkString = (
    obj: Record<string, unknown>,
    key: string,
    path: string,
    target: IssueTarget,
    required = false,
  ): string | undefined => {
    const value = obj[key];
    if (value === undefined) {
      if (required)
        error(
          'missing_property',
          pointer(path, key),
          target,
          `Missing required property "${key}"`,
          { expected: 'a string' },
        );
      return undefined;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      error('invalid_type', pointer(path, key), target, `"${key}" must be a non-empty string`, {
        expected: 'a non-empty string',
      });
      return undefined;
    }
    return value;
  };

  const checkBoolean = (
    obj: Record<string, unknown>,
    key: string,
    path: string,
    target: IssueTarget,
  ): boolean | undefined => {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
      error('invalid_type', pointer(path, key), target, `"${key}" must be true or false`, {
        expected: 'a boolean',
      });
      return undefined;
    }
    return value;
  };

  const checkEnum = <T extends string>(
    obj: Record<string, unknown>,
    key: string,
    allowed: readonly T[],
    path: string,
    target: IssueTarget,
  ): T | undefined => {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (!(allowed as readonly unknown[]).includes(value)) {
      const near = typeof value === 'string' ? closest(value, allowed) : undefined;
      error(
        'invalid_value',
        pointer(path, key),
        target,
        `"${key}" must be one of ${quoteList(allowed)}`,
        {
          expected: quoteList(allowed),
          suggestion: near ? `Did you mean "${near}"?` : undefined,
        },
      );
      return undefined;
    }
    return value as T;
  };

  checkKeys(root, ROOT_KEYS, '', ROOT);
  const formId = root['id'];
  if (typeof formId !== 'string' || !ID_PATTERN.test(formId)) {
    error(
      formId === undefined ? 'missing_property' : 'invalid_id',
      '/id',
      ROOT,
      '"id" must be an identifier',
      {
        expected: 'letters, digits and "_", starting with a letter',
      },
    );
  }
  const title = checkString(root, 'title', '', ROOT);
  const description = checkString(root, 'description', '', ROOT);
  const submitLabel = checkString(root, 'submitLabel', '', ROOT) ?? 'Submit';
  const showReset = checkBoolean(root, 'showReset', '', ROOT) ?? false;
  const validateOn =
    checkEnum(root, 'validateOn', ['submit', 'blur', 'change'] as const, '', ROOT) ?? 'submit';
  const hiddenValues =
    checkEnum(root, 'hiddenValues', ['omit', 'keep'] as const, '', ROOT) ?? 'omit';
  let themeName: string | null = null;
  if (root['theme'] !== undefined) {
    if (typeof root['theme'] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(root['theme'])) {
      error('invalid_value', '/theme', ROOT, '"theme" must be the name of a registered theme', {
        expected: 'letters, digits and "-"',
      });
    } else {
      themeName = root['theme'];
    }
  }

  const hasLayout = root['layout'] !== undefined;
  const hasPages = root['pages'] !== undefined;
  if (hasLayout === hasPages) {
    error(
      hasLayout ? 'invalid_layout' : 'missing_property',
      hasLayout ? '/pages' : '/layout',
      ROOT,
      hasLayout
        ? 'Use either "layout" (one page) or "pages", not both'
        : 'A configuration needs "layout" (one page) or "pages"',
      {
        suggestion: hasLayout
          ? 'Move the layout into the pages, or remove "pages".'
          : 'Add "layout": [ ...component ids ].',
      },
    );
  }
  const mode: 'single' | 'pages' = hasPages ? 'pages' : 'single';

  // 3. Components: ids and registered types.
  const components = new Map<string, RawComponent>();
  /** Every id in the shared namespace of components, layout nodes and pages. */
  const ids = new Map<string, string>();
  const rawComponents = root['components'];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    error(
      rawComponents === undefined ? 'missing_property' : 'invalid_type',
      '/components',
      ROOT,
      '"components" must be a non-empty array',
      {
        expected: 'an array of { id, type, ...props }',
      },
    );
    return fail();
  }
  if (rawComponents.length > maxComponents) {
    error('limit_exceeded', '/components', ROOT, `At most ${maxComponents} components are allowed`);
    return fail();
  }

  rawComponents.forEach((raw: unknown, index) => {
    const path = `/components/${index}`;
    if (!isPlainObject(raw)) {
      error(
        'invalid_type',
        path,
        { kind: 'component', id: '', index },
        'A component must be an object',
        { expected: '{ id, type, ...props }' },
      );
      return;
    }
    const id = raw['id'];
    const target: IssueTarget = { kind: 'component', id: typeof id === 'string' ? id : '', index };
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      error(
        id === undefined ? 'missing_property' : 'invalid_id',
        pointer(path, 'id'),
        target,
        '"id" must be an identifier',
        {
          expected: 'letters, digits and "_", starting with a letter',
          suggestion:
            typeof id === 'string'
              ? `Use "${id.replace(/[^A-Za-z0-9_]+(.)?/g, (_m, c: string | undefined) => (c ?? '').toUpperCase()).replace(/^[^A-Za-z]+/, '') || 'field1'}".`
              : undefined,
        },
      );
      return;
    }
    if (ids.has(id)) {
      error(
        'duplicate_id',
        pointer(path, 'id'),
        target,
        `Duplicate id "${id}" (first used at ${ids.get(id)})`,
        {
          componentId: id,
          suggestion: `Give this component a different id, e.g. "${id}2".`,
        },
      );
      return;
    }
    ids.set(id, path);
    const type = raw['type'];
    const spec = typeof type === 'string' ? catalog.get(type) : undefined;
    if (!spec) {
      const near = typeof type === 'string' ? closest(type, catalog.types) : undefined;
      error(
        type === undefined ? 'missing_property' : 'unknown_component_type',
        pointer(path, 'type'),
        target,
        type === undefined ? 'Missing "type"' : `Unknown component type ${JSON.stringify(type)}`,
        {
          componentId: id,
          expected: quoteList(catalog.types),
          suggestion: near ? `Did you mean "${near}"?` : 'Use a type from the catalog.',
        },
      );
    }
    components.set(id, { raw, index, id, spec });
  });

  // 4. Component props (value-typed props and references are checked after placement).
  const isPrimitive = (value: unknown) =>
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));

  const checkJson = (value: unknown, path: string, target: IssueTarget, depth = 0): boolean => {
    if (depth > 32) {
      error('limit_exceeded', path, target, 'Value nests too deeply');
      return false;
    }
    if (isPrimitive(value)) return true;
    if (Array.isArray(value))
      return value.every((item, i) => checkJson(item, pointer(path, i), target, depth + 1));
    if (isPlainObject(value))
      return Object.keys(value).every((key) =>
        checkJson(value[key], pointer(path, key), target, depth + 1),
      );
    error('invalid_type', path, target, 'Value must be JSON', {
      expected: 'a string, number, boolean, null, array or object',
    });
    return false;
  };

  const checkOptions = (
    value: unknown,
    valueKind: 'string' | 'string-or-number',
    path: string,
    target: IssueTarget,
    componentId?: string,
  ): Option[] | undefined => {
    if (!Array.isArray(value) || value.length === 0) {
      error('invalid_prop', path, target, 'Options must be a non-empty array', {
        componentId,
        expected: '[{ "label": "...", "value": "..." }]',
      });
      return undefined;
    }
    const seen = new Set<unknown>();
    let ok = true;
    value.forEach((option: unknown, i) => {
      const at = pointer(path, i);
      if (!isPlainObject(option)) {
        error('invalid_prop', at, target, 'An option must be { label, value }', {
          componentId,
          expected: '{ "label": string, "value": string }',
        });
        ok = false;
        return;
      }
      checkKeys(
        option,
        ['label', 'value', 'description', 'disabled'],
        at,
        target,
        componentId ? { componentId } : {},
      );
      if (typeof option['label'] !== 'string' || option['label'] === '') {
        error(
          'invalid_prop',
          pointer(at, 'label'),
          target,
          'Option "label" must be a non-empty string',
          { componentId },
        );
        ok = false;
      }
      const v = option['value'];
      const valid =
        valueKind === 'string'
          ? typeof v === 'string'
          : typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
      if (!valid) {
        error('invalid_prop', pointer(at, 'value'), target, 'Option "value" has the wrong type', {
          componentId,
          expected: valueKind === 'string' ? 'a string' : 'a string or number',
        });
        ok = false;
      } else if (seen.has(v)) {
        error(
          'invalid_prop',
          pointer(at, 'value'),
          target,
          `Duplicate option value ${JSON.stringify(v)}`,
          { componentId },
        );
        ok = false;
      }
      seen.add(v);
      if (option['description'] !== undefined && typeof option['description'] !== 'string') {
        error(
          'invalid_prop',
          pointer(at, 'description'),
          target,
          'Option "description" must be a string',
          { componentId },
        );
      }
      if (option['disabled'] !== undefined && typeof option['disabled'] !== 'boolean') {
        error(
          'invalid_prop',
          pointer(at, 'disabled'),
          target,
          'Option "disabled" must be a boolean',
          { componentId },
        );
      }
    });
    return ok ? (value as Option[]) : undefined;
  };

  const checkProp = (
    prop: string,
    propSpec: PropSpec,
    value: unknown,
    path: string,
    target: IssueTarget,
    componentId: string,
  ): void => {
    const bad = (expected: string, message = `"${prop}" must be ${expected}`) =>
      error('invalid_prop', path, target, message, { componentId, expected });
    const type = propSpec.type;
    switch (type.kind) {
      case 'string':
        if (typeof value !== 'string') bad('a string');
        return;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) bad('a number');
        return;
      case 'integer':
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          (type.min !== undefined && value < type.min)
        ) {
          bad(type.min !== undefined ? `an integer of at least ${type.min}` : 'an integer');
        }
        return;
      case 'boolean':
        if (typeof value !== 'boolean') bad('true or false');
        return;
      case 'enum':
        if (!type.values.includes(value as string | number)) {
          const near =
            typeof value === 'string' ? closest(value, type.values.map(String)) : undefined;
          error(
            'invalid_prop',
            path,
            target,
            `"${prop}" must be one of ${quoteList(type.values)}`,
            {
              componentId,
              expected: quoteList(type.values),
              suggestion: near ? `Did you mean "${near}"?` : undefined,
            },
          );
        }
        return;
      case 'date':
        if (typeof value !== 'string' || !ISO_DATE.test(value)) bad('a date "YYYY-MM-DD"');
        return;
      case 'regex':
        if (typeof value !== 'string' || value === '') {
          bad('a regular expression string');
        } else if (value.length > MAX_PATTERN_LENGTH) {
          error(
            'limit_exceeded',
            path,
            target,
            `Patterns are limited to ${MAX_PATTERN_LENGTH} characters`,
            { componentId },
          );
        } else {
          try {
            new RegExp(value, 'u');
          } catch (cause) {
            bad(
              'a valid regular expression',
              `"${prop}" is not a valid regular expression: ${(cause as Error).message}`,
            );
          }
        }
        return;
      case 'options':
        checkOptions(value, type.valueKind, path, target, componentId);
        return;
      case 'fieldRef':
        if (typeof value !== 'string') bad('the id of a form component');
        return;
      case 'validatorRef':
        if (typeof value !== 'string' || !HANDLER_PATTERN.test(value)) {
          bad('a validator name');
        } else if (options.validators && !options.validators.includes(value)) {
          const near = closest(value, options.validators);
          error('unknown_reference', path, target, `No validator is registered as "${value}"`, {
            componentId,
            expected: quoteList(options.validators),
            suggestion: near ? `Did you mean "${near}"?` : undefined,
          });
        }
        return;
      case 'messages':
        if (!isPlainObject(value)) {
          bad('an object of messages');
          return;
        }
        for (const [key, message] of Object.entries(value)) {
          if (!MESSAGE_KEYS.includes(key)) {
            const near = closest(key, MESSAGE_KEYS);
            error('invalid_prop', pointer(path, key), target, `Unknown message key "${key}"`, {
              componentId,
              expected: quoteList(MESSAGE_KEYS),
              suggestion: near ? `Did you mean "${near}"?` : undefined,
            });
          } else if (typeof message !== 'string' || message === '') {
            error(
              'invalid_prop',
              pointer(path, key),
              target,
              'A message must be a non-empty string',
              { componentId },
            );
          }
        }
        return;
      case 'layout':
        if (!Array.isArray(value) || value.length === 0) bad('a non-empty layout array');
        return; // walked with the layout
      case 'value':
        return; // checked after placement, once options are known
      case 'json':
        checkJson(value, path, target);
        return;
    }
  };

  for (const component of components.values()) {
    const { raw, index, id, spec } = component;
    if (!spec) continue;
    const path = `/components/${index}`;
    const target: IssueTarget = { kind: 'component', id, index };
    const propNames = Object.keys(spec.props);
    for (const key of Object.keys(raw)) {
      if (key === 'id' || key === 'type' || key === 'on') continue;
      const propSpec = spec.props[key];
      if (!propSpec) {
        const near = closest(key, propNames);
        error(
          'unknown_property',
          pointer(path, key),
          target,
          `"${spec.type}" has no prop "${key}"`,
          {
            componentId: id,
            expected: propNames.length ? quoteList(propNames) : 'no props',
            suggestion: near ? `Did you mean "${near}"?` : `Remove "${key}".`,
          },
        );
        continue;
      }
      checkProp(key, propSpec, raw[key], pointer(path, key), target, id);
    }
    for (const [name, propSpec] of Object.entries(spec.props)) {
      if (propSpec.required && raw[name] === undefined) {
        error(
          'missing_property',
          pointer(path, name),
          target,
          `"${spec.type}" requires "${name}"`,
          {
            componentId: id,
            expected: propSpec.description,
          },
        );
      }
    }
    if (
      typeof raw['minLength'] === 'number' &&
      typeof raw['maxLength'] === 'number' &&
      raw['minLength'] > raw['maxLength']
    ) {
      error(
        'invalid_prop',
        pointer(path, 'minLength'),
        target,
        '"minLength" is greater than "maxLength"',
        { componentId: id },
      );
    }
    for (const [low, high] of [
      ['min', 'max'],
      ['minItems', 'maxItems'],
    ] as const) {
      const a = raw[low];
      const b = raw[high];
      if (
        (typeof a === 'number' && typeof b === 'number' && a > b) ||
        (typeof a === 'string' && typeof b === 'string' && a > b)
      ) {
        error('invalid_prop', pointer(path, low), target, `"${low}" is greater than "${high}"`, {
          componentId: id,
        });
      }
    }
  }

  // 5. Layout and page membership.
  const placements = new Map<string, Placement>();
  const layoutParents = new Map<string, string>(); // layout node id -> parent id
  const layoutPages = new Map<string, string>();
  const layoutRepeater = new Map<string, string | null>();
  const repeaterLayouts = new Map<string, NormalizedLayoutItem[]>();

  const walkLayout = (
    items: unknown,
    path: string,
    target: IssueTarget,
    page: string,
    repeater: string | null,
    parentId: string,
    parentType: Parent,
    keyPrefix: string,
    depth: number,
  ): NormalizedLayoutItem[] => {
    if (depth > maxDepth) {
      error('limit_exceeded', path, target, `Layouts nest deeper than ${maxDepth}`);
      return [];
    }
    if (!Array.isArray(items) || items.length === 0) {
      error(
        'invalid_layout',
        path,
        target,
        'A layout must be a non-empty array of component ids and layout nodes',
        {
          expected: '["componentId", { "type": "row", "children": [...] }]',
        },
      );
      return [];
    }
    const out: NormalizedLayoutItem[] = [];
    items.forEach((item: unknown, index) => {
      const at = pointer(path, index);
      if (typeof item === 'string') {
        const component = components.get(item);
        if (!component) {
          const near = closest(item, components.keys());
          error('unknown_reference', at, target, `No component has the id "${item}"`, {
            expected: 'a component id',
            suggestion: near
              ? `Did you mean "${near}"?`
              : `Add a component with "id": "${item}", or remove it from the layout.`,
          });
          return;
        }
        const previous = placements.get(item);
        if (previous) {
          error(
            'duplicate_placement',
            at,
            target,
            `Component "${item}" is already placed${previous.page !== page ? ` on page "${previous.page}"` : ''}`,
            {
              componentId: item,
              suggestion:
                'Place each component once; to show it in several places, define separate components.',
            },
          );
          return;
        }
        placements.set(item, { page, repeater, parent: parentId });
        out.push({ kind: 'component', id: item });
        const spec = component.spec;
        if (!spec) return;
        const context = repeater ? 'repeater' : 'form';
        if (!spec.contexts.includes(context)) {
          error(
            'invalid_context',
            at,
            target,
            `"${spec.type}" cannot be placed ${repeater ? "inside a repeater's item" : 'directly in a form'}`,
            {
              componentId: item,
              expected: `contexts: ${quoteList(spec.contexts)}`,
            },
          );
        }
        for (const [prop, propSpec] of Object.entries(spec.props)) {
          if (propSpec.type.kind !== 'layout' || component.raw[prop] === undefined) continue;
          if (spec.kind !== 'repeater') continue;
          if (repeater) {
            error('invalid_nesting', at, target, 'Repeaters cannot be nested', {
              componentId: item,
            });
            continue;
          }
          repeaterLayouts.set(
            item,
            walkLayout(
              component.raw[prop],
              `/components/${component.index}/${prop}`,
              { kind: 'component', id: item, index: component.index },
              page,
              item,
              item,
              'item',
              `#${item}`,
              depth + 1,
            ),
          );
        }
        return;
      }
      if (!isPlainObject(item)) {
        error(
          'invalid_layout',
          at,
          target,
          'A layout entry must be a component id or a layout node',
          {
            expected: '"componentId" or { "type": "row", "children": [...] }',
          },
        );
        return;
      }
      checkKeys(item, LAYOUT_KEYS, at, target);
      const type = item['type'];
      if (typeof type !== 'string' || !(LAYOUT_TYPES as readonly string[]).includes(type)) {
        const near = typeof type === 'string' ? closest(type, LAYOUT_TYPES) : undefined;
        error(
          'invalid_layout',
          pointer(at, 'type'),
          target,
          `Unknown layout type ${JSON.stringify(type)}`,
          {
            expected: quoteList(LAYOUT_TYPES),
            suggestion: near ? `Did you mean "${near}"?` : undefined,
          },
        );
        return;
      }
      const layoutType = type as LayoutType;
      if (!ALLOWED_CHILDREN[parentType].includes(layoutType)) {
        error(
          'invalid_nesting',
          pointer(at, 'type'),
          target,
          `A "${layoutType}" cannot be placed ${parentType === 'root' ? 'here' : parentType === 'item' ? "in a repeater's item" : `inside a "${parentType}"`}`,
          {
            expected: quoteList(ALLOWED_CHILDREN[parentType]),
          },
        );
      }
      let id = `${keyPrefix}.${index}`;
      const rawId = item['id'];
      if (rawId !== undefined) {
        if (typeof rawId !== 'string' || !ID_PATTERN.test(rawId)) {
          error('invalid_id', pointer(at, 'id'), target, 'Layout node "id" must be an identifier');
        } else if (ids.has(rawId)) {
          error(
            'duplicate_id',
            pointer(at, 'id'),
            target,
            `Duplicate id "${rawId}" (first used at ${ids.get(rawId)})`,
          );
        } else {
          ids.set(rawId, at);
          id = rawId;
        }
      }
      if (
        (item['title'] !== undefined || item['description'] !== undefined) &&
        layoutType !== 'section' &&
        layoutType !== 'group'
      ) {
        error(
          'unknown_property',
          pointer(at, item['title'] !== undefined ? 'title' : 'description'),
          target,
          `A "${layoutType}" has no title or description`,
          { suggestion: 'Use a "section" or "group" to title content.' },
        );
      }
      const nodeTitle = checkString(item, 'title', at, target);
      const nodeDescription = checkString(item, 'description', at, target);
      const responsive = checkResponsiveProps(item, layoutType, parentType, at, target);
      layoutParents.set(id, parentId);
      layoutPages.set(id, page);
      layoutRepeater.set(id, repeater);
      const children = walkLayout(
        item['children'],
        pointer(at, 'children'),
        target,
        page,
        repeater,
        id,
        layoutType,
        id,
        depth + 1,
      );
      const node: NormalizedLayoutNode = {
        kind: 'layout',
        id,
        type: layoutType,
        ...(nodeTitle !== undefined ? { title: nodeTitle } : {}),
        ...(nodeDescription !== undefined ? { description: nodeDescription } : {}),
        ...responsive,
        children,
      };
      if (node.visibleOn.length < BREAKPOINTS.length) {
        const field = firstField(children);
        if (field) {
          error(
            'invalid_layout',
            pointer(at, 'visibleOn'),
            target,
            `"visibleOn" would hide the form field "${field}" on some screen sizes`,
            {
              componentId: field,
              suggestion:
                'Use "visibleOn" only around headings, paragraphs and alerts, or show the field with a dependency.',
            },
          );
        }
      }
      out.push(node);
    });
    return out;
  };

  /** The first form field (or repeater) inside a layout, if any. */
  const firstField = (items: readonly NormalizedLayoutItem[]): string | undefined => {
    for (const item of items) {
      if (item.kind === 'component') {
        const kind = components.get(item.id)?.spec?.kind;
        if (kind === 'field' || kind === 'repeater') return item.id;
      } else {
        const inner = firstField(item.children);
        if (inner) return inner;
      }
    }
    return undefined;
  };

  type ResponsiveProps = Pick<
    NormalizedLayoutNode,
    'columns' | 'gap' | 'stackBelow' | 'align' | 'justify' | 'maxWidth' | 'span' | 'visibleOn'
  >;
  const checkResponsiveProps = (
    item: Record<string, unknown>,
    type: LayoutType,
    parentType: Parent,
    at: string,
    target: IssueTarget,
  ): ResponsiveProps => {
    const only = (key: string, allowed: readonly LayoutType[], why: string) => {
      if (item[key] !== undefined && !allowed.includes(type)) {
        error('unknown_property', pointer(at, key), target, `A "${type}" has no "${key}"`, {
          suggestion: why,
        });
        return false;
      }
      return item[key] !== undefined;
    };
    /** A value or a { mobile, tablet, desktop } object whose values are all in `allowed`. */
    const responsiveOf = <T>(key: string, allowed: readonly T[]): Responsive<T> | undefined => {
      const value = item[key];
      if (value === undefined) return undefined;
      const fits = (v: unknown) => allowed.includes(v as T);
      if (isPlainObject(value)) {
        const keys = Object.keys(value);
        const badKey = keys.find((k) => !(BREAKPOINTS as readonly string[]).includes(k));
        if (keys.length === 0 || badKey !== undefined) {
          const near = badKey ? closest(badKey, BREAKPOINTS) : undefined;
          error(
            'invalid_value',
            badKey ? pointer(pointer(at, key), badKey) : pointer(at, key),
            target,
            `"${key}" breakpoints must be ${quoteList(BREAKPOINTS)}`,
            {
              expected: `${quoteList(allowed)} or { "mobile": ..., "tablet": ..., "desktop": ... }`,
              suggestion: near ? `Did you mean "${near}"?` : undefined,
            },
          );
          return undefined;
        }
        for (const k of keys) {
          if (!fits(value[k])) {
            error(
              'invalid_value',
              pointer(pointer(at, key), k),
              target,
              `"${key}.${k}" must be one of ${quoteList(allowed)}`,
              { expected: quoteList(allowed) },
            );
            return undefined;
          }
        }
        return value as Responsive<T>;
      }
      if (!fits(value)) {
        error(
          'invalid_value',
          pointer(at, key),
          target,
          `"${key}" must be one of ${quoteList(allowed)} or a per-breakpoint object`,
          { expected: quoteList(allowed) },
        );
        return undefined;
      }
      return value as Responsive<T>;
    };
    const out: { -readonly [K in keyof ResponsiveProps]: ResponsiveProps[K] } = {
      gap: resolveResponsive(responsiveOf<Gap>('gap', ['none', 'small', 'medium', 'large']), {
        mobile: 'medium',
        tablet: 'medium',
        desktop: 'medium',
      }),
      maxWidth: 'full',
      visibleOn: [...BREAKPOINTS],
    };
    if (type === 'grid')
      out.columns = resolveColumns(
        only('columns', ['grid'], 'Use a "grid" for columns.')
          ? responsiveOf<number>('columns', [1, 2, 3, 4])
          : undefined,
      );
    else only('columns', ['grid'], 'Use a "grid" for columns.');
    if (type === 'row') {
      out.stackBelow = 'tablet';
      out.align = 'stretch';
      out.justify = 'start';
    }
    if (only('stackBelow', ['row'], 'Only a "row" stacks.')) {
      out.stackBelow =
        checkEnum(item, 'stackBelow', ['tablet', 'desktop', 'never'] as const, at, target) ??
        'tablet';
    }
    if (only('align', ['row'], 'Only a "row" aligns its children.'))
      out.align =
        checkEnum(item, 'align', ['start', 'center', 'end', 'stretch'] as const, at, target) ??
        'stretch';
    if (only('justify', ['row'], 'Only a "row" distributes its children.'))
      out.justify =
        checkEnum(item, 'justify', ['start', 'center', 'end', 'between'] as const, at, target) ??
        'start';
    if (
      only(
        'maxWidth',
        ['column', 'section', 'group'],
        'Give the width to a column, section or group.',
      )
    ) {
      out.maxWidth =
        checkEnum(item, 'maxWidth', ['narrow', 'medium', 'wide', 'full'] as const, at, target) ??
        'full';
    }
    if (item['span'] !== undefined) {
      if (parentType !== 'grid')
        error(
          'unknown_property',
          pointer(at, 'span'),
          target,
          '"span" applies only to a node directly inside a "grid"',
        );
      else
        out.span = resolveResponsive(responsiveOf<number>('span', [1, 2, 3, 4]), {
          mobile: 1,
          tablet: 1,
          desktop: 1,
        });
    }
    const visibleOn = item['visibleOn'];
    if (visibleOn !== undefined) {
      if (
        !Array.isArray(visibleOn) ||
        visibleOn.length === 0 ||
        !visibleOn.every((b) => (BREAKPOINTS as readonly unknown[]).includes(b)) ||
        new Set(visibleOn).size !== visibleOn.length
      ) {
        error(
          'invalid_value',
          pointer(at, 'visibleOn'),
          target,
          '"visibleOn" must list distinct breakpoints',
          { expected: quoteList(BREAKPOINTS) },
        );
      } else {
        out.visibleOn = BREAKPOINTS.filter((b) => visibleOn.includes(b));
      }
    }
    return out;
  };

  interface PageDraft {
    id: string;
    index: number;
    title?: string;
    description?: string;
    layout: NormalizedLayoutItem[];
    rawSubmission: unknown;
  }
  const pages: PageDraft[] = [];
  if (mode === 'single') {
    if (hasLayout) {
      pages.push({
        id: SINGLE_PAGE_ID,
        index: 0,
        layout: walkLayout(
          root['layout'],
          '/layout',
          { kind: 'layout' },
          SINGLE_PAGE_ID,
          null,
          SINGLE_PAGE_ID,
          'root',
          SINGLE_PAGE_ID,
          0,
        ),
        rawSubmission: undefined,
      });
    }
  } else {
    const rawPages = root['pages'];
    if (!Array.isArray(rawPages) || rawPages.length === 0) {
      error('invalid_type', '/pages', ROOT, '"pages" must be a non-empty array', {
        expected: '[{ "id": "...", "layout": [...] }]',
      });
    } else {
      rawPages.forEach((rawPage: unknown, index) => {
        const path = `/pages/${index}`;
        const pageIdValue = isPlainObject(rawPage) ? rawPage['id'] : undefined;
        const target: IssueTarget = {
          kind: 'page',
          id: typeof pageIdValue === 'string' ? pageIdValue : '',
          index,
        };
        if (!isPlainObject(rawPage)) {
          error('invalid_type', path, target, 'A page must be an object', {
            expected: '{ "id": "...", "layout": [...] }',
          });
          return;
        }
        checkKeys(rawPage, PAGE_KEYS, path, target);
        if (typeof pageIdValue !== 'string' || !ID_PATTERN.test(pageIdValue)) {
          error(
            pageIdValue === undefined ? 'missing_property' : 'invalid_id',
            pointer(path, 'id'),
            target,
            'Page "id" must be an identifier',
          );
          return;
        }
        if (ids.has(pageIdValue)) {
          error(
            'duplicate_id',
            pointer(path, 'id'),
            target,
            `Duplicate id "${pageIdValue}" (first used at ${ids.get(pageIdValue)})`,
            { pageId: pageIdValue },
          );
          return;
        }
        ids.set(pageIdValue, path);
        const pageTitle = checkString(rawPage, 'title', path, target);
        const pageDescription = checkString(rawPage, 'description', path, target);
        pages.push({
          id: pageIdValue,
          index,
          ...(pageTitle !== undefined ? { title: pageTitle } : {}),
          ...(pageDescription !== undefined ? { description: pageDescription } : {}),
          layout: walkLayout(
            rawPage['layout'],
            pointer(path, 'layout'),
            target,
            pageIdValue,
            null,
            pageIdValue,
            'root',
            pageIdValue,
            0,
          ),
          rawSubmission: rawPage['submission'],
        });
      });
    }
  }

  // Without any layout the "never placed" errors would only repeat the missing layout.
  for (const component of pages.length === 0 ? [] : components.values()) {
    if (!placements.has(component.id)) {
      error(
        'unplaced_component',
        `/components/${component.index}`,
        { kind: 'component', id: component.id, index: component.index },
        `Component "${component.id}" is never placed in the layout`,
        {
          componentId: component.id,
          suggestion:
            mode === 'pages'
              ? `Add "${component.id}" to a page's layout, or remove the component.`
              : `Add "${component.id}" to "layout", or remove the component.`,
        },
      );
    }
  }

  const isValueComponent = (id: string) => {
    const kind = components.get(id)?.spec?.kind;
    return kind === 'field' || kind === 'repeater';
  };
  const optionsOf = (id: string): readonly Option[] | undefined => {
    const raw = components.get(id)?.raw['options'];
    return Array.isArray(raw) ? (raw as Option[]) : undefined;
  };

  /** Why `value` is not a valid value for component `id`, or undefined when it is. */
  const valueProblem = (id: string, value: unknown): string | undefined => {
    const spec = components.get(id)?.spec;
    const valueSpec = spec?.value;
    if (!valueSpec) return 'this component holds no value';
    const opts = optionsOf(id);
    const optionValues = opts?.map((option) => option.value) ?? [];
    switch (valueSpec.type) {
      case 'string':
        return typeof value === 'string' ? undefined : 'a string';
      case 'number':
        return value === null || (typeof value === 'number' && Number.isFinite(value))
          ? undefined
          : 'a number or null';
      case 'boolean':
        return typeof value === 'boolean' ? undefined : 'true or false';
      case 'date':
        return value === null || (typeof value === 'string' && ISO_DATE.test(value))
          ? undefined
          : 'a date "YYYY-MM-DD" or null';
      case 'option':
        return value === null || optionValues.includes(value as string | number)
          ? undefined
          : `null or one of ${quoteList(optionValues)}`;
      case 'optionList':
        return Array.isArray(value) &&
          value.every((item) => optionValues.includes(item as string | number)) &&
          new Set(value).size === value.length
          ? undefined
          : `an array of distinct values from ${quoteList(optionValues)}`;
      case 'rows':
        return Array.isArray(value) && value.every((row) => isPlainObject(row))
          ? undefined
          : 'an array of row objects';
      case 'json':
        return undefined;
    }
  };

  // 6. Value-typed props and field references.
  for (const component of components.values()) {
    const { raw, index, id, spec } = component;
    if (!spec) continue;
    const target: IssueTarget = { kind: 'component', id, index };
    for (const [prop, propSpec] of Object.entries(spec.props)) {
      const value = raw[prop];
      if (value === undefined) continue;
      const path = `/components/${index}/${prop}`;
      if (propSpec.type.kind === 'value') {
        if (spec.value?.type === 'json') {
          checkJson(value, path, target);
        } else {
          const problem = valueProblem(id, value);
          if (problem)
            error(
              'invalid_prop',
              path,
              target,
              `"${prop}" is not a valid value for this ${spec.type}`,
              { componentId: id, expected: problem },
            );
        }
      } else if (propSpec.type.kind === 'fieldRef' && typeof value === 'string') {
        const other = components.get(value);
        if (!other) {
          const near = closest(value, components.keys());
          error('unknown_reference', path, target, `No component has the id "${value}"`, {
            componentId: id,
            suggestion: near ? `Did you mean "${near}"?` : undefined,
          });
        } else if (other.spec?.kind !== 'field' || value === id) {
          error('unknown_reference', path, target, `"${prop}" must name another form field`, {
            componentId: id,
          });
        } else if (
          (placements.get(value)?.repeater ?? null) !== (placements.get(id)?.repeater ?? null)
        ) {
          error(
            'ambiguous_row_reference',
            path,
            target,
            `"${prop}" must name a field in the same repeater item (or both outside repeaters)`,
            { componentId: id },
          );
        }
      }
    }
  }

  // Build the parent chain used for scope and ancestry checks.
  const parentOf = (id: string): string | undefined =>
    placements.get(id)?.parent ?? layoutParents.get(id);
  const ancestorsOf = (id: string): string[] => {
    const chain: string[] = [];
    let current = parentOf(id);
    while (current !== undefined && !chain.includes(current)) {
      chain.push(current);
      current = parentOf(current);
    }
    return chain;
  };
  const pageIds = new Set(pages.map((page) => page.id));
  const repeaterOf = (id: string): string | null =>
    placements.get(id)?.repeater ?? layoutRepeater.get(id) ?? null;

  // 7. Dependencies.
  const dependencies: NormalizedDependency[] = [];
  const rawDependencies = root['dependencies'];
  if (rawDependencies !== undefined && !Array.isArray(rawDependencies)) {
    error('invalid_type', '/dependencies', ROOT, '"dependencies" must be an array');
  }
  const checkCondition = (
    value: unknown,
    path: string,
    target: IssueTarget,
    depth = 0,
  ): value is Condition => {
    if (depth > maxDepth) {
      error('limit_exceeded', path, target, 'Condition nests too deeply');
      return false;
    }
    if (!isPlainObject(value)) {
      error('invalid_condition', path, target, 'A condition must be an object', {
        expected:
          '{ "field": "id", "op": "eq", "value": ... } or { "all": [...] } / { "any": [...] } / { "not": {...} }',
      });
      return false;
    }
    for (const combinator of ['all', 'any'] as const) {
      if (combinator in value) {
        checkKeys(value, [combinator], path, target);
        const list = value[combinator];
        if (!Array.isArray(list) || list.length === 0) {
          error(
            'invalid_condition',
            pointer(path, combinator),
            target,
            `"${combinator}" needs a non-empty array of conditions`,
          );
          return false;
        }
        return list
          .map((inner, i) =>
            checkCondition(inner, pointer(pointer(path, combinator), i), target, depth + 1),
          )
          .every(Boolean);
      }
    }
    if ('not' in value) {
      checkKeys(value, ['not'], path, target);
      return checkCondition(value['not'], pointer(path, 'not'), target, depth + 1);
    }
    const op = value['op'];
    if (typeof op !== 'string' || !OPS.includes(op)) {
      const near = typeof op === 'string' ? closest(op, OPS) : undefined;
      error(
        'invalid_condition',
        pointer(path, 'op'),
        target,
        `Unknown operator ${JSON.stringify(op)}`,
        {
          expected: quoteList(OPS),
          suggestion: near ? `Did you mean "${near}"?` : undefined,
        },
      );
      return false;
    }
    const needsValue = op !== 'filled' && op !== 'empty';
    checkKeys(value, needsValue ? ['field', 'op', 'value'] : ['field', 'op'], path, target);
    const field = value['field'];
    if (typeof field !== 'string' || !components.has(field)) {
      const near = typeof field === 'string' ? closest(field, components.keys()) : undefined;
      error(
        'unknown_reference',
        pointer(path, 'field'),
        target,
        `No component has the id ${JSON.stringify(field)}`,
        {
          expected: 'the id of a form component',
          suggestion: near ? `Did you mean "${near}"?` : undefined,
        },
      );
      return false;
    }
    if (!isValueComponent(field)) {
      error(
        'invalid_condition',
        pointer(path, 'field'),
        target,
        `"${field}" holds no value, so a condition cannot read it`,
        { componentId: field },
      );
      return false;
    }
    if (!needsValue) return true;
    if (!('value' in value)) {
      error('missing_property', pointer(path, 'value'), target, `"${op}" needs a "value"`);
      return false;
    }
    const operand = value['value'];
    const valueType = components.get(field)?.spec?.value?.type;
    const optionValues = optionsOf(field)?.map((option) => option.value);
    const bad = (expected: string) => {
      error(
        'invalid_condition',
        pointer(path, 'value'),
        target,
        `"${op}" on "${field}" needs ${expected}`,
        { componentId: field, expected },
      );
      return false;
    };
    const fitsField = (item: unknown): boolean => {
      if (item === null) return true;
      switch (valueType) {
        case 'string':
          return typeof item === 'string';
        case 'number':
          return typeof item === 'number';
        case 'boolean':
          return typeof item === 'boolean';
        case 'date':
          return typeof item === 'string' && ISO_DATE.test(item);
        case 'option':
          return optionValues?.includes(item as string | number) ?? false;
        default:
          return isPrimitive(item);
      }
    };
    const fieldExpectation = () =>
      valueType === 'option' && optionValues
        ? `one of ${quoteList(optionValues)}`
        : `a ${valueType ?? 'primitive'} value`;
    switch (op) {
      case 'eq':
      case 'neq':
        if (valueType === 'optionList' || valueType === 'rows')
          return bad('"includes" for a multi-choice field, or "filled"/"empty"');
        return fitsField(operand) ? true : bad(fieldExpectation());
      case 'in':
      case 'notIn':
        if (!Array.isArray(operand) || operand.length === 0) return bad('a non-empty array');
        return operand.every(fitsField) ? true : bad(`an array of ${fieldExpectation()}`);
      case 'includes':
        if (valueType !== 'optionList')
          return bad('a multi-choice field ("includes" only applies to them)');
        return optionValues?.includes(operand as string | number)
          ? true
          : bad(`one of ${quoteList(optionValues ?? [])}`);
      default:
        if (valueType === 'number')
          return typeof operand === 'number' && Number.isFinite(operand) ? true : bad('a number');
        if (valueType === 'date')
          return typeof operand === 'string' && ISO_DATE.test(operand)
            ? true
            : bad('a date "YYYY-MM-DD"');
        return bad('a number or date field (comparisons apply only to them)');
    }
  };

  if (Array.isArray(rawDependencies)) {
    rawDependencies.forEach((rawDependency: unknown, index) => {
      const path = `/dependencies/${index}`;
      const target: IssueTarget = { kind: 'dependency', index };
      if (!isPlainObject(rawDependency)) {
        error('invalid_type', path, target, 'A dependency must be an object', {
          expected: '{ "when": {...}, "effect": "show", "target": "id" }',
        });
        return;
      }
      checkKeys(rawDependency, DEPENDENCY_KEYS, path, target);
      const conditionOk = checkCondition(rawDependency['when'], pointer(path, 'when'), target);
      const effect = rawDependency['effect'];
      if (typeof effect !== 'string' || !(EFFECTS as readonly string[]).includes(effect)) {
        const near = typeof effect === 'string' ? closest(effect, EFFECTS) : undefined;
        error(
          'unsupported_effect',
          pointer(path, 'effect'),
          target,
          `Unknown effect ${JSON.stringify(effect)}`,
          {
            expected: quoteList(EFFECTS),
            suggestion: near ? `Did you mean "${near}"?` : undefined,
          },
        );
        return;
      }
      const effectType = effect as EffectType;
      const rawTarget = rawDependency['target'];
      const targets =
        typeof rawTarget === 'string'
          ? [rawTarget]
          : Array.isArray(rawTarget)
            ? rawTarget
            : undefined;
      if (
        !targets ||
        targets.length === 0 ||
        !targets.every((t): t is string => typeof t === 'string')
      ) {
        error(
          'invalid_type',
          pointer(path, 'target'),
          target,
          '"target" must be an id or a non-empty array of ids',
        );
        return;
      }
      if (new Set(targets).size !== targets.length) {
        error('invalid_value', pointer(path, 'target'), target, '"target" lists the same id twice');
      }
      if (
        effectType === 'set' ? !('value' in rawDependency) : rawDependency['value'] !== undefined
      ) {
        error(
          effectType === 'set' ? 'missing_property' : 'unknown_property',
          pointer(path, 'value'),
          target,
          effectType === 'set' ? '"set" needs a "value"' : 'Only "set" takes a "value"',
        );
      }
      if (
        effectType === 'options'
          ? rawDependency['options'] === undefined
          : rawDependency['options'] !== undefined
      ) {
        error(
          effectType === 'options' ? 'missing_property' : 'unknown_property',
          pointer(path, 'options'),
          target,
          effectType === 'options'
            ? '"options" needs an "options" list'
            : 'Only "options" takes "options"',
        );
      }
      const sources = conditionOk ? conditionFields(rawDependency['when'] as Condition) : [];
      const sourceRepeaters = new Set(
        sources.map(repeaterOf).filter((r): r is string => r !== null),
      );
      if (sourceRepeaters.size > 1) {
        error(
          'ambiguous_row_reference',
          pointer(path, 'when'),
          target,
          'A condition cannot read fields of two different repeaters',
        );
      }
      const scope = sourceRepeaters.size === 1 ? ([...sourceRepeaters][0] as string) : null;

      targets.forEach((targetId, ti) => {
        const at =
          typeof rawTarget === 'string'
            ? pointer(path, 'target')
            : pointer(pointer(path, 'target'), ti);
        const component = components.get(targetId);
        const isLayout = layoutParents.has(targetId);
        const isPage = pageIds.has(targetId) && mode === 'pages';
        if (!component && !isLayout && !isPage) {
          const near = closest(
            targetId,
            [...components.keys(), ...layoutParents.keys(), ...pageIds].filter(
              (id) => !id.startsWith('#'),
            ),
          );
          error(
            'unknown_reference',
            at,
            target,
            `No component, layout node or page has the id "${targetId}"`,
            {
              suggestion: near
                ? `Did you mean "${near}"?`
                : 'Give the layout node an "id" to target it.',
            },
          );
          return;
        }
        const supported: readonly EffectType[] =
          component?.spec?.effects ?? (component ? [] : VISIBILITY_EFFECTS);
        if (!supported.includes(effectType)) {
          error(
            'unsupported_effect',
            pointer(path, 'effect'),
            target,
            `"${effectType}" does not apply to "${targetId}"`,
            {
              componentId: component ? targetId : undefined,
              pageId: isPage ? targetId : undefined,
              expected: quoteList(supported),
            },
          );
          return;
        }
        if (effectType === 'set' && component && 'value' in rawDependency) {
          if (component.spec?.value?.type === 'rows') {
            error(
              'unsupported_effect',
              pointer(path, 'effect'),
              target,
              '"set" cannot write a repeater',
              { componentId: targetId },
            );
          } else {
            const problem = valueProblem(targetId, rawDependency['value']);
            if (problem)
              error(
                'invalid_value',
                pointer(path, 'value'),
                target,
                `"value" does not fit "${targetId}"`,
                { componentId: targetId, expected: problem },
              );
          }
        }
        if (effectType === 'options' && component) {
          const valueKind = component.spec?.props['options']?.type;
          checkOptions(
            rawDependency['options'],
            valueKind?.kind === 'options' ? valueKind.valueKind : 'string-or-number',
            pointer(path, 'options'),
            target,
            targetId,
          );
        }
        const targetRepeater = repeaterOf(targetId);
        if (scope !== null && targetRepeater !== scope) {
          error(
            'ambiguous_row_reference',
            at,
            target,
            `The condition reads fields of repeater "${scope}" rows, so its target must be in the same repeater item`,
            {
              componentId: component ? targetId : undefined,
            },
          );
        }
        if (
          sources.includes(targetId) &&
          effectType !== 'require' &&
          effectType !== 'optional' &&
          effectType !== 'options'
        ) {
          error('self_dependency', at, target, `"${targetId}" depends on its own value`, {
            suggestion:
              effectType === 'set' || effectType === 'clear'
                ? 'A value effect on its own source would undo the change that triggered it.'
                : 'Once hidden or disabled it could never change back.',
          });
        }
        if (
          (effectType === 'hide' ||
            effectType === 'show' ||
            effectType === 'disable' ||
            effectType === 'enable') &&
          !sources.includes(targetId)
        ) {
          const trapped = sources.find((source) => ancestorsOf(source).includes(targetId));
          if (trapped) {
            error(
              'self_dependency',
              at,
              target,
              `"${targetId}" contains "${trapped}", which its own condition reads`,
              {
                suggestion: `Move "${trapped}" outside "${targetId}".`,
              },
            );
          }
        }
      });

      if (conditionOk) {
        const normalized: NormalizedDependency = {
          index,
          when: cloneJson(rawDependency['when'] as Condition),
          effect: effectType,
          targets: [...targets],
          ...(effectType === 'set'
            ? { value: cloneJson(rawDependency['value'] as JsonValue) }
            : {}),
          ...(effectType === 'options'
            ? { options: cloneJson(rawDependency['options'] as Option[]) }
            : {}),
          sources,
          scope,
        };
        dependencies.push(normalized);
      }
    });
  }

  // Contradictory state effects: deterministic, but worth a warning.
  const effectsByTarget = new Map<string, Set<EffectType>>();
  for (const dependency of dependencies) {
    for (const t of dependency.targets) {
      const set = effectsByTarget.get(t) ?? new Set();
      if (dependency.effect === 'set' && set.has('set')) {
        report(
          'warning',
          'conflicting_effects',
          `/dependencies/${dependency.index}`,
          { kind: 'dependency', index: dependency.index },
          `More than one "set" targets "${t}"; when several fire together, the later rule's value wins`,
        );
      }
      set.add(dependency.effect);
      effectsByTarget.set(t, set);
    }
  }
  for (const [t, set] of effectsByTarget) {
    for (const [a, b, rule] of [
      ['show', 'hide', 'hide wins'],
      ['enable', 'disable', 'disable wins'],
      ['require', 'optional', 'optional wins'],
    ] as const) {
      if (set.has(a) && set.has(b)) {
        report(
          'warning',
          'conflicting_effects',
          '/dependencies',
          { kind: 'root' },
          `"${t}" has both "${a}" and "${b}" rules; when both hold, ${rule}`,
        );
      }
    }
  }

  // Value effects must not form a cycle (A sets B, B sets A ...).
  const writes = new Map<string, Set<string>>();
  for (const dependency of dependencies) {
    if (dependency.effect !== 'set' && dependency.effect !== 'clear') continue;
    for (const source of dependency.sources) {
      const set = writes.get(source) ?? new Set();
      for (const t of dependency.targets) set.add(t);
      writes.set(source, set);
    }
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (node: string) => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of writes.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(next)), next];
        const key = [...cycle].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          error(
            'dependency_cycle',
            '/dependencies',
            ROOT,
            `Value effects form a cycle: ${cycle.join(' → ')}`,
            {
              suggestion: 'Remove one "set" or "clear" rule in the cycle.',
            },
          );
        }
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 'done');
  };
  for (const node of writes.keys()) if (!state.has(node)) visit(node);

  // 8. Actions on component events.
  const actionCalls = new Map<string, Record<string, NormalizedActionCall>>();
  for (const component of components.values()) {
    const { raw, index, id, spec } = component;
    const on = raw['on'];
    if (on === undefined || !spec) continue;
    const path = `/components/${index}/on`;
    const target: IssueTarget = { kind: 'component', id, index };
    if (!isPlainObject(on)) {
      error('invalid_type', path, target, '"on" must map event names to actions', {
        componentId: id,
        expected: '{ "click": { "action": "form.reset" } }',
      });
      continue;
    }
    const calls: Record<string, NormalizedActionCall> = {};
    for (const [event, rawCall] of Object.entries(on)) {
      const at = pointer(path, event);
      if (!spec.events.includes(event)) {
        const near = closest(event, spec.events);
        error('unknown_event', at, target, `"${spec.type}" has no "${event}" event`, {
          componentId: id,
          expected: spec.events.length ? quoteList(spec.events) : 'no events',
          suggestion: near ? `Did you mean "${near}"?` : undefined,
        });
        continue;
      }
      if (!isPlainObject(rawCall)) {
        error(
          'invalid_type',
          at,
          target,
          'An event handler must be { "action": "...", "args": {...} }',
          { componentId: id },
        );
        continue;
      }
      checkKeys(rawCall, ['action', 'args'], at, target, { componentId: id });
      const actionId = rawCall['action'];
      const actionSpec = typeof actionId === 'string' ? actions.get(actionId) : undefined;
      if (!actionSpec) {
        const near = typeof actionId === 'string' ? closest(actionId, actions.ids) : undefined;
        error(
          'unknown_action',
          pointer(at, 'action'),
          target,
          `Unknown action ${JSON.stringify(actionId)}`,
          {
            componentId: id,
            expected: quoteList(actions.ids),
            suggestion: near ? `Did you mean "${near}"?` : undefined,
          },
        );
        continue;
      }
      if (!actionSpec.events.includes(event)) {
        error('unknown_event', at, target, `"${actionSpec.id}" cannot run on "${event}"`, {
          componentId: id,
          expected: quoteList(actionSpec.events),
        });
      }
      if (!actionSpec.contexts.includes(mode)) {
        error(
          'invalid_action_context',
          pointer(at, 'action'),
          target,
          `"${actionSpec.id}" only works in a ${actionSpec.contexts.includes('pages') ? 'multi-page' : 'single-page'} form`,
          {
            componentId: id,
          },
        );
      }
      const args = rawCall['args'] ?? {};
      if (!isPlainObject(args)) {
        error('invalid_action_args', pointer(at, 'args'), target, '"args" must be an object', {
          componentId: id,
        });
        continue;
      }
      const argNames = Object.keys(actionSpec.args);
      for (const key of Object.keys(args)) {
        if (!actionSpec.args[key]) {
          const near = closest(key, argNames);
          error(
            'invalid_action_args',
            pointer(pointer(at, 'args'), key),
            target,
            `"${actionSpec.id}" takes no argument "${key}"`,
            {
              componentId: id,
              expected: argNames.length ? quoteList(argNames) : 'no arguments',
              suggestion: near ? `Did you mean "${near}"?` : `Remove "${key}".`,
            },
          );
        }
      }
      for (const [name, argSpec] of Object.entries(actionSpec.args)) {
        const value = args[name];
        const argPath = pointer(pointer(at, 'args'), name);
        if (value === undefined) {
          if (argSpec.required)
            error('invalid_action_args', argPath, target, `"${actionSpec.id}" needs "${name}"`, {
              componentId: id,
              expected: argSpec.description,
            });
          continue;
        }
        const ok =
          argSpec.type === 'pageId'
            ? typeof value === 'string' && pageIds.has(value) && mode === 'pages'
            : argSpec.type === 'componentId'
              ? typeof value === 'string' && components.has(value)
              : typeof value === argSpec.type;
        if (!ok) {
          const pool =
            argSpec.type === 'pageId'
              ? pageIds
              : argSpec.type === 'componentId'
                ? components.keys()
                : [];
          const near = typeof value === 'string' ? closest(value, pool) : undefined;
          error(
            'invalid_action_args',
            argPath,
            target,
            `"${name}" must be ${argSpec.type === 'pageId' ? 'a page id' : argSpec.type === 'componentId' ? 'a component id' : `a ${argSpec.type}`}`,
            {
              componentId: id,
              expected: argSpec.type === 'pageId' ? quoteList(pageIds) : argSpec.type,
              suggestion: near ? `Did you mean "${near}"?` : undefined,
            },
          );
        }
      }
      calls[event] = { action: actionSpec.id, args: cloneJson(args as JsonObject) };
    }
    actionCalls.set(id, calls);
  }

  // 9. Navigation and submission.
  const rawNavigation = root['navigation'];
  let navigation: NormalizedConfig['navigation'] = {
    progress: 'steps',
    allowBack: true,
    validateOnNext: true,
    previousLabel: 'Previous',
    nextLabel: 'Next',
  };
  if (rawNavigation !== undefined) {
    if (mode !== 'pages') {
      error(
        'unknown_property',
        '/navigation',
        ROOT,
        '"navigation" applies only to a configuration with "pages"',
        { suggestion: 'Remove "navigation".' },
      );
    } else if (!isPlainObject(rawNavigation)) {
      error('invalid_type', '/navigation', ROOT, '"navigation" must be an object');
    } else {
      checkKeys(rawNavigation, NAVIGATION_KEYS, '/navigation', ROOT);
      navigation = {
        progress:
          checkEnum(
            rawNavigation,
            'progress',
            ['steps', 'bar', 'none'] as const,
            '/navigation',
            ROOT,
          ) ?? navigation.progress,
        allowBack:
          checkBoolean(rawNavigation, 'allowBack', '/navigation', ROOT) ?? navigation.allowBack,
        validateOnNext:
          checkBoolean(rawNavigation, 'validateOnNext', '/navigation', ROOT) ??
          navigation.validateOnNext,
        previousLabel:
          checkString(rawNavigation, 'previousLabel', '/navigation', ROOT) ??
          navigation.previousLabel,
        nextLabel:
          checkString(rawNavigation, 'nextLabel', '/navigation', ROOT) ?? navigation.nextLabel,
      };
    }
  }

  const SUBMISSION: IssueTarget = { kind: 'submission' };
  const checkHandler = (
    value: unknown,
    path: string,
    target: IssueTarget,
    pageId?: string,
  ): string | undefined => {
    if (typeof value !== 'string' || !HANDLER_PATTERN.test(value)) {
      error(
        'invalid_value',
        path,
        target,
        'A handler must be a registered handler name like "application.submit"',
        { pageId, expected: 'a dotted identifier' },
      );
      return undefined;
    }
    if (options.handlers && !options.handlers.includes(value)) {
      const near = closest(value, options.handlers);
      error('unknown_handler', path, target, `No submit handler is registered as "${value}"`, {
        pageId,
        expected: quoteList(options.handlers),
        suggestion: near ? `Did you mean "${near}"?` : undefined,
      });
    }
    return value;
  };

  const rawSubmission = root['submission'];
  let strategy: SubmissionStrategy = 'final';
  let formHandler: string | null = null;
  let payload: SubmissionPayload = 'page';
  let advanceOnSuccess = true;
  let requireStepSubmission = true;
  if (rawSubmission !== undefined) {
    if (!isPlainObject(rawSubmission)) {
      error('invalid_type', '/submission', SUBMISSION, '"submission" must be an object', {
        expected: '{ "strategy": "final" }',
      });
    } else {
      checkKeys(rawSubmission, SUBMISSION_KEYS, '/submission', SUBMISSION);
      strategy =
        checkEnum(
          rawSubmission,
          'strategy',
          ['final', 'perStep'] as const,
          '/submission',
          SUBMISSION,
        ) ?? 'final';
      if (rawSubmission['handler'] !== undefined)
        formHandler =
          checkHandler(rawSubmission['handler'], '/submission/handler', SUBMISSION) ?? null;
      if (strategy === 'perStep') {
        if (mode !== 'pages') {
          error(
            'incompatible_submission',
            '/submission/strategy',
            SUBMISSION,
            '"perStep" submission needs "pages"',
            {
              suggestion:
                'Use "strategy": "final" for a single-page form, or split the layout into pages.',
            },
          );
        }
        payload =
          checkEnum(
            rawSubmission,
            'payload',
            ['page', 'all'] as const,
            '/submission',
            SUBMISSION,
          ) ?? 'page';
        advanceOnSuccess =
          checkBoolean(rawSubmission, 'advanceOnSuccess', '/submission', SUBMISSION) ?? true;
        requireStepSubmission =
          checkBoolean(rawSubmission, 'requireStepSubmission', '/submission', SUBMISSION) ?? true;
      } else {
        for (const key of ['payload', 'advanceOnSuccess', 'requireStepSubmission']) {
          if (rawSubmission[key] !== undefined) {
            error(
              'incompatible_submission',
              pointer('/submission', key),
              SUBMISSION,
              `"${key}" applies only to "perStep" submission`,
              {
                suggestion: `Remove "${key}", or set "strategy": "perStep".`,
              },
            );
          }
        }
      }
    }
  }

  const normalizedPages: NormalizedPage[] = [];
  const hiddenTargets = new Set(
    dependencies
      .filter((d) => d.effect === 'show' || d.effect === 'hide')
      .flatMap((d) => d.targets),
  );
  for (const page of pages) {
    let submission: NormalizedPageSubmission | null = null;
    const path = `/pages/${page.index}/submission`;
    const target: IssueTarget = { kind: 'page', id: page.id, index: page.index };
    if (page.rawSubmission !== undefined) {
      if (strategy !== 'perStep') {
        error(
          'incompatible_submission',
          path,
          target,
          'A page "submission" requires "submission": { "strategy": "perStep" }',
          {
            pageId: page.id,
            suggestion:
              'Set the form-level "submission.strategy" to "perStep", or remove this page submission.',
          },
        );
      } else if (!isPlainObject(page.rawSubmission)) {
        error('invalid_type', path, target, 'A page "submission" must be an object', {
          pageId: page.id,
          expected: '{ "handler": "application.save" }',
        });
      } else {
        checkKeys(page.rawSubmission, PAGE_SUBMISSION_KEYS, path, target, { pageId: page.id });
        const handler =
          page.rawSubmission['handler'] === undefined
            ? (error(
                'missing_property',
                pointer(path, 'handler'),
                target,
                'A page "submission" needs a "handler"',
                { pageId: page.id },
              ),
              undefined)
            : checkHandler(
                page.rawSubmission['handler'],
                pointer(path, 'handler'),
                target,
                page.id,
              );
        const pagePayload =
          checkEnum(page.rawSubmission, 'payload', ['page', 'all'] as const, path, target) ??
          payload;
        const isLast = page === pages[pages.length - 1];
        const label =
          checkString(page.rawSubmission, 'label', path, target) ??
          (isLast ? submitLabel : 'Save and continue');
        if (handler) submission = { handler, payload: pagePayload, label };
      }
    }
    normalizedPages.push({
      id: page.id,
      ...(page.title !== undefined ? { title: page.title } : {}),
      ...(page.description !== undefined ? { description: page.description } : {}),
      layout: page.layout,
      submission,
      fields: [],
    });
  }
  const lastPage = normalizedPages[normalizedPages.length - 1];
  if (
    strategy === 'perStep' &&
    lastPage?.submission &&
    formHandler !== null &&
    !hiddenTargets.has(lastPage.id)
  ) {
    error(
      'unused_handler',
      '/submission/handler',
      SUBMISSION,
      `The last page "${lastPage.id}" always submits with its own handler, so "submission.handler" would never run`,
      {
        suggestion: 'Remove one of the two handlers.',
      },
    );
  }

  // 10. Initial values and defaults.
  const INITIAL: IssueTarget = { kind: 'initialValues' };
  const rawInitial = root['initialValues'];
  if (rawInitial !== undefined && !isPlainObject(rawInitial)) {
    error(
      'invalid_type',
      '/initialValues',
      INITIAL,
      '"initialValues" must be an object keyed by component id',
    );
  }
  const initialSource = isPlainObject(rawInitial) ? rawInitial : {};
  const defaultOf = (id: string): unknown => {
    const component = components.get(id);
    const value = component?.raw['defaultValue'];
    return value !== undefined
      ? cloneJson(value)
      : cloneJson(component?.spec?.value?.empty ?? null);
  };
  const itemFields = (repeaterId: string) =>
    [...components.values()]
      .filter((c) => placements.get(c.id)?.repeater === repeaterId && isValueComponent(c.id))
      .map((c) => c.id);
  const initialValues: Record<string, JsonValue> = {};
  for (const key of Object.keys(initialSource)) {
    const component = components.get(key);
    if (!component || !isValueComponent(key) || placements.get(key)?.repeater) {
      const near = closest(
        key,
        [...components.keys()].filter(
          (id) => isValueComponent(id) && !placements.get(id)?.repeater,
        ),
      );
      error(
        'unknown_reference',
        pointer('/initialValues', key),
        INITIAL,
        component ? `"${key}" holds no top-level value` : `No form component has the id "${key}"`,
        {
          suggestion: near
            ? `Did you mean "${near}"?`
            : component && placements.get(key)?.repeater
              ? `Give "${key}" a value inside its repeater's rows.`
              : undefined,
        },
      );
    }
  }
  for (const component of components.values()) {
    const { id, spec } = component;
    if (!spec?.value || placements.get(id)?.repeater) continue;
    const has = Object.prototype.hasOwnProperty.call(initialSource, id);
    const value = has ? initialSource[id] : undefined;
    if (spec.kind === 'repeater') {
      const item = itemFields(id);
      const makeRow = (row: Record<string, unknown> | undefined, rowPath: string) => {
        const out: Record<string, JsonValue> = {};
        for (const key of Object.keys(row ?? {})) {
          if (!item.includes(key)) {
            error(
              'unknown_reference',
              pointer(rowPath, key),
              INITIAL,
              `"${key}" is not a field of repeater "${id}"`,
              { expected: quoteList(item) },
            );
          }
        }
        for (const field of item) {
          if (row && Object.prototype.hasOwnProperty.call(row, field)) {
            const problem = valueProblem(field, row[field]);
            if (problem)
              error(
                'invalid_value',
                pointer(rowPath, field),
                INITIAL,
                `Initial value for "${field}" has the wrong type`,
                { componentId: field, expected: problem },
              );
            out[field] = cloneJson(row[field]) as JsonValue;
          } else {
            out[field] = defaultOf(field) as JsonValue;
          }
        }
        return out;
      };
      if (has) {
        if (!Array.isArray(value) || !value.every(isPlainObject)) {
          error(
            'invalid_value',
            pointer('/initialValues', id),
            INITIAL,
            `Initial value for repeater "${id}" must be an array of rows`,
            { componentId: id },
          );
          initialValues[id] = [];
        } else {
          initialValues[id] = value.map((row, i) =>
            makeRow(row as Record<string, unknown>, pointer(pointer('/initialValues', id), i)),
          );
        }
      } else {
        const count = typeof component.raw['minItems'] === 'number' ? component.raw['minItems'] : 0;
        initialValues[id] = Array.from({ length: count }, () => makeRow(undefined, ''));
      }
      continue;
    }
    if (has) {
      const problem = valueProblem(id, value);
      if (problem)
        error(
          'invalid_value',
          pointer('/initialValues', id),
          INITIAL,
          `Initial value for "${id}" has the wrong type`,
          { componentId: id, expected: problem },
        );
      initialValues[id] = cloneJson(value) as JsonValue;
    } else {
      initialValues[id] = defaultOf(id) as JsonValue;
    }
  }

  if (errors.length > 0) return fail();

  // 11. Normalize.
  const normalizedComponents: NormalizedComponent[] = [];
  for (const component of components.values()) {
    const spec = component.spec as ComponentSpec;
    const placement = placements.get(component.id) as Placement;
    const props: Record<string, JsonValue> = {};
    for (const [name, propSpec] of Object.entries(spec.props)) {
      if (propSpec.type.kind === 'layout') continue;
      const value = component.raw[name];
      if (value !== undefined) props[name] = cloneJson(value) as JsonValue;
      else if (propSpec.default !== undefined) props[name] = cloneJson(propSpec.default);
    }
    const layout = repeaterLayouts.get(component.id);
    normalizedComponents.push({
      id: component.id,
      type: spec.type,
      kind: spec.kind,
      props,
      on: actionCalls.get(component.id) ?? {},
      value: spec.value ? { type: spec.value.type, empty: cloneJson(spec.value.empty) } : null,
      page: placement.page,
      repeater: placement.repeater,
      parent: placement.parent,
      ...(layout ? { layout } : {}),
    });
  }
  const valueOrder = collectFieldOrder(normalizedPages);
  const pagesWithFields = normalizedPages.map((page) => ({
    ...page,
    fields: valueOrder.get(page.id)?.filter((id) => isValueComponent(id)) ?? [],
  }));

  const config: NormalizedConfig = {
    compilerVersion: COMPILER_VERSION,
    version: 1,
    id: formId as string,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    mode,
    components: normalizedComponents,
    pages: pagesWithFields,
    dependencies,
    navigation,
    submission: {
      strategy,
      handler: formHandler,
      payload,
      advanceOnSuccess,
      requireStepSubmission,
    },
    initialValues,
    validateOn,
    hiddenValues,
    submitLabel,
    showReset,
    theme: themeName,
  };
  deepFreeze(config);
  return { ok: true, config, form: buildIndex(config, catalog, actions), warnings };
}

/** Component ids per page in layout order, outside repeaters. */
function collectFieldOrder(pages: readonly NormalizedPage[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (items: readonly NormalizedLayoutItem[], into: string[]) => {
    for (const item of items) {
      if (item.kind === 'component') into.push(item.id);
      else walk(item.children, into);
    }
  };
  for (const page of pages) {
    const list: string[] = [];
    walk(page.layout, list);
    out.set(page.id, list);
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

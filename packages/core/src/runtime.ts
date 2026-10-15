import type { ActionCatalog, Catalog } from './catalog.js';
import type {
  NormalizedComponent,
  NormalizedConfig,
  NormalizedDependency,
  NormalizedPage,
} from './compile.js';
import { evaluateCondition, type PathResolver } from './conditions.js';
import type { JsonValue, Option, SubmissionPayload } from './config.js';
import { cloneJson, getAt, isEmptyValue, type FormValues } from './values.js';

/**
 * Lookup structures over a normalized config, built once per compile. Holds
 * no form values: every function that needs values takes them as an argument,
 * so one CompiledForm can serve any number of independent forms.
 */
export interface CompiledForm {
  readonly config: NormalizedConfig;
  readonly catalog: Catalog;
  readonly actions: ActionCatalog;
  readonly components: ReadonlyMap<string, NormalizedComponent>;
  readonly pageOrder: readonly string[];
  page(id: string): NormalizedPage | undefined;
  /** Dependency rules targeting this id, in config order. */
  rulesFor(id: string): readonly NormalizedDependency[];
  /** `set` and `clear` rules, in config order. */
  readonly valueRules: readonly NormalizedDependency[];
  /** Containers of a component or layout node, innermost first, ending with its page. */
  ancestors(id: string): readonly string[];
  /** Component ids whose values can change this id's state (its rules and its ancestors'). */
  stateSources(id: string): readonly string[];
  /** Ids of the form components in a repeater's item, in layout order. */
  itemFields(repeaterId: string): readonly string[];
  /** The value path of a component: its id, or "<repeater>.<row>.<id>" inside a row. */
  pathOf(componentId: string, rowPrefix?: string): string;
  resolverFor(rowPrefix: string): PathResolver;
  getInitialValues(): FormValues;
  createRow(repeaterId: string): FormValues;
}

export function buildIndex(
  config: NormalizedConfig,
  catalog: Catalog,
  actions: ActionCatalog,
): CompiledForm {
  const components = new Map(config.components.map((component) => [component.id, component]));
  const pages = new Map(config.pages.map((page) => [page.id, page]));
  const rules = new Map<string, NormalizedDependency[]>();
  for (const dependency of config.dependencies) {
    for (const target of dependency.targets) {
      const list = rules.get(target) ?? [];
      list.push(dependency);
      rules.set(target, list);
    }
  }

  const parents = new Map<string, string>();
  const itemFields = new Map<string, string[]>();
  const walk = (items: NormalizedPage['layout'], parent: string, repeater: string | null) => {
    for (const item of items) {
      parents.set(item.id, parent);
      if (item.kind === 'layout') {
        walk(item.children, item.id, repeater);
        continue;
      }
      const component = components.get(item.id);
      if (repeater && component?.kind === 'field') {
        const list = itemFields.get(repeater) ?? [];
        list.push(item.id);
        itemFields.set(repeater, list);
      }
      if (component?.layout) walk(component.layout, component.id, component.id);
    }
  };
  for (const page of config.pages) walk(page.layout, page.id, null);

  const ancestorCache = new Map<string, string[]>();
  const ancestors = (id: string): string[] => {
    let chain = ancestorCache.get(id);
    if (!chain) {
      chain = [];
      let current = parents.get(id);
      while (current !== undefined) {
        chain.push(current);
        current = parents.get(current);
      }
      ancestorCache.set(id, chain);
    }
    return chain;
  };

  const sourceCache = new Map<string, string[]>();
  const stateSources = (id: string): string[] => {
    let sources = sourceCache.get(id);
    if (!sources) {
      const set = new Set<string>();
      for (const target of [id, ...ancestors(id)]) {
        for (const rule of rules.get(target) ?? []) {
          if (rule.effect === 'set' || rule.effect === 'clear') continue;
          for (const source of rule.sources) set.add(source);
        }
      }
      sources = [...set];
      sourceCache.set(id, sources);
    }
    return sources;
  };

  const pathOf = (componentId: string, rowPrefix = '') =>
    rowPrefix !== '' && components.get(componentId)?.repeater
      ? `${rowPrefix}${componentId}`
      : componentId;

  const resolverCache = new Map<string, PathResolver>();
  const resolverFor = (rowPrefix: string): PathResolver => {
    let resolver = resolverCache.get(rowPrefix);
    if (!resolver) {
      resolver = (id) => pathOf(id, rowPrefix);
      resolverCache.set(rowPrefix, resolver);
    }
    return resolver;
  };

  const createRow = (repeaterId: string): FormValues => {
    const row: FormValues = {};
    for (const field of itemFields.get(repeaterId) ?? []) {
      const component = components.get(field);
      const value = component?.props['defaultValue'];
      row[field] = cloneJson(value !== undefined ? value : (component?.value?.empty ?? null));
    }
    return row;
  };

  return Object.freeze({
    config,
    catalog,
    actions,
    components,
    pageOrder: config.pages.map((page) => page.id),
    page: (id: string) => pages.get(id),
    rulesFor: (id: string) => rules.get(id) ?? [],
    valueRules: config.dependencies.filter((d) => d.effect === 'set' || d.effect === 'clear'),
    ancestors,
    stateSources,
    itemFields: (repeaterId: string) => itemFields.get(repeaterId) ?? [],
    pathOf,
    resolverFor,
    getInitialValues: () => cloneJson(config.initialValues) as FormValues,
    createRow,
  });
}

// ---------------------------------------------------------------------------
// Component state
// ---------------------------------------------------------------------------

export interface ComponentState {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly readOnly: boolean;
  /** Effective options of a choice component: the first matching `options` rule's, or its own. */
  readonly options: readonly Option[] | undefined;
}

function holds(
  form: CompiledForm,
  rule: NormalizedDependency,
  values: FormValues,
  rowPrefix: string,
): boolean {
  return evaluateCondition(
    rule.when,
    values,
    form.resolverFor(rule.scope === null ? '' : rowPrefix),
  );
}

/** Whether an id is shown by its own show/hide rules (not counting its containers). Hide wins. */
export function isSelfVisible(
  form: CompiledForm,
  id: string,
  values: FormValues,
  rowPrefix = '',
): boolean {
  let shows = 0;
  let shown = false;
  for (const rule of form.rulesFor(id)) {
    if (rule.effect === 'hide' && holds(form, rule, values, rowPrefix)) return false;
    if (rule.effect === 'show') {
      shows += 1;
      if (!shown) shown = holds(form, rule, values, rowPrefix);
    }
  }
  return shows === 0 || shown;
}

/** Whether a component, layout node or page is visible, including its containers. */
export function isVisible(
  form: CompiledForm,
  id: string,
  values: FormValues,
  rowPrefix = '',
): boolean {
  if (!isSelfVisible(form, id, values, rowPrefix)) return false;
  for (const ancestor of form.ancestors(id)) {
    if (!isSelfVisible(form, ancestor, values, rowPrefix)) return false;
  }
  return true;
}

function isSelfDisabled(
  form: CompiledForm,
  id: string,
  values: FormValues,
  rowPrefix: string,
): boolean {
  const base = form.components.get(id)?.props['disabled'] === true;
  let enables = 0;
  let enabled = false;
  for (const rule of form.rulesFor(id)) {
    if (rule.effect === 'disable' && holds(form, rule, values, rowPrefix)) return true;
    if (rule.effect === 'enable') {
      enables += 1;
      if (!enabled) enabled = holds(form, rule, values, rowPrefix);
    }
  }
  return enables > 0 ? !enabled : base;
}

/**
 * The effective state of a component given the current values.
 * Precedence when rules disagree: hide over show, disable over enable,
 * optional over require; the first matching `options` rule wins.
 * A field inside a disabled repeater is disabled.
 */
export function resolveState(
  form: CompiledForm,
  id: string,
  values: FormValues,
  rowPrefix = '',
): ComponentState {
  const component = form.components.get(id);
  const props = component?.props ?? {};
  let required = props['required'] === true;
  let options = Array.isArray(props['options'])
    ? (props['options'] as readonly Option[])
    : undefined;
  let optionsMatched = false;
  let optional = false;
  for (const rule of form.rulesFor(id)) {
    if (rule.effect === 'require' && !required && holds(form, rule, values, rowPrefix))
      required = true;
    else if (rule.effect === 'optional' && !optional && holds(form, rule, values, rowPrefix))
      optional = true;
    else if (rule.effect === 'options' && !optionsMatched && holds(form, rule, values, rowPrefix)) {
      options = rule.options;
      optionsMatched = true;
    }
  }
  let disabled = isSelfDisabled(form, id, values, rowPrefix);
  if (!disabled && component?.repeater)
    disabled = isSelfDisabled(form, component.repeater, values, '');
  return {
    visible: isVisible(form, id, values, rowPrefix),
    disabled,
    required: required && !optional,
    readOnly: props['readOnly'] === true,
    options,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidatorContext {
  readonly values: FormValues;
  readonly path: string;
  readonly component: NormalizedComponent;
}

/** A validator the application registers in TypeScript and a config names. Return a message when invalid. */
export type CustomValidator = (
  value: unknown,
  context: ValidatorContext,
) => string | null | undefined;

export type MessageKey =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'minItems'
  | 'maxItems'
  | 'pattern'
  | 'matches'
  | 'option'
  | 'number'
  | 'date';

/** Default messages. `{value}` is the limit, `{label}` the other field's label. */
export const defaultMessages: Readonly<Record<MessageKey | 'checked', string>> = {
  required: 'This field is required.',
  checked: 'This must be checked.',
  minLength: 'Enter at least {value} characters.',
  maxLength: 'Enter no more than {value} characters.',
  min: 'Enter {value} or more.',
  max: 'Enter {value} or less.',
  minItems: 'Choose at least {value}.',
  maxItems: 'Choose no more than {value}.',
  pattern: 'Enter a value in the expected format.',
  matches: 'This must match {label}.',
  option: 'Choose one of the listed options.',
  number: 'Enter a number.',
  date: 'Enter a date.',
};

export interface ValidateOptions {
  /**
   * Validate only these value paths (a repeater's path covers its rows).
   * Paths not validated keep no entry in the result.
   */
  readonly names?: readonly string[];
  /** Validate only fields on these pages. */
  readonly pages?: readonly string[];
  readonly validators?: Readonly<Record<string, CustomValidator>>;
  /** Application-wide message overrides; a component's `messages` prop wins over these. */
  readonly messages?: Partial<Record<MessageKey | 'checked', string>>;
}

export interface ValidationResult {
  readonly valid: boolean;
  /** Messages by value path, in layout order. A repeater's own error uses its id as the path. */
  readonly errors: Readonly<Record<string, string>>;
}

const patternCache = new Map<string, RegExp>();
function wholeMatch(source: string): RegExp {
  let regex = patternCache.get(source);
  if (!regex) {
    regex = new RegExp(`^(?:${source})$`, 'u');
    patternCache.set(source, regex);
  }
  return regex;
}

function message(
  component: NormalizedComponent,
  key: MessageKey | 'checked',
  options: ValidateOptions,
  params: Record<string, string> = {},
): string {
  const own = component.props['messages'];
  const ownKey = key === 'checked' ? 'required' : key;
  const fromComponent =
    own && typeof own === 'object' && !Array.isArray(own)
      ? (own as Record<string, JsonValue>)[ownKey]
      : undefined;
  const template =
    typeof fromComponent === 'string'
      ? fromComponent
      : (options.messages?.[key] ?? defaultMessages[key]);
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

function lengthOf(value: unknown): number | undefined {
  return typeof value === 'string' || Array.isArray(value) ? value.length : undefined;
}

/** The first failing constraint's message for one value, or undefined. */
export function validateField(
  form: CompiledForm,
  component: NormalizedComponent,
  value: unknown,
  values: FormValues,
  rowPrefix: string,
  state: ComponentState,
  options: ValidateOptions = {},
): string | undefined {
  const props = component.props;
  const type = component.value?.type;
  const path = form.pathOf(component.id, rowPrefix);
  const num = (key: string) =>
    typeof props[key] === 'number' ? (props[key] as number) : undefined;

  if (state.required) {
    if (type === 'boolean' ? value !== true : isEmptyValue(value)) {
      return message(component, type === 'boolean' ? 'checked' : 'required', options);
    }
  }
  const empty = isEmptyValue(value);
  if (component.kind === 'repeater') {
    const rows = Array.isArray(value) ? value.length : 0;
    const min = num('minItems');
    const max = num('maxItems');
    if (min !== undefined && rows < min)
      return message(component, 'minItems', options, { value: String(min) });
    if (max !== undefined && rows > max)
      return message(component, 'maxItems', options, { value: String(max) });
    return undefined;
  }
  if (empty) return undefined;

  switch (type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        return message(component, 'number', options);
      break;
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return message(component, 'date', options);
      break;
    case 'option':
    case 'optionList': {
      const allowed = state.options ?? [];
      const list = Array.isArray(value) ? value : [value];
      if (
        !list.every((item) => allowed.some((option) => option.value === item && !option.disabled))
      ) {
        return message(component, 'option', options);
      }
      break;
    }
    default:
      break;
  }

  const length = lengthOf(value);
  const minLength = num('minLength');
  const maxLength = num('maxLength');
  if (typeof value === 'string' && length !== undefined) {
    if (minLength !== undefined && length < minLength)
      return message(component, 'minLength', options, { value: String(minLength) });
    if (maxLength !== undefined && length > maxLength)
      return message(component, 'maxLength', options, { value: String(maxLength) });
  }
  if (Array.isArray(value)) {
    const min = num('minItems');
    const max = num('maxItems');
    if (min !== undefined && value.length < min)
      return message(component, 'minItems', options, { value: String(min) });
    if (max !== undefined && value.length > max)
      return message(component, 'maxItems', options, { value: String(max) });
  }
  const min = props['min'];
  const max = props['max'];
  if (typeof value === 'number' || type === 'date') {
    const comparable = value as number | string;
    if ((typeof min === 'number' || typeof min === 'string') && comparable < min)
      return message(component, 'min', options, { value: String(min) });
    if ((typeof max === 'number' || typeof max === 'string') && comparable > max)
      return message(component, 'max', options, { value: String(max) });
  }
  const pattern = props['pattern'];
  if (
    typeof pattern === 'string' &&
    typeof value === 'string' &&
    !wholeMatch(pattern).test(value)
  ) {
    return message(component, 'pattern', options);
  }
  const matches = props['matches'];
  if (typeof matches === 'string') {
    const other = getAt(values, form.pathOf(matches, rowPrefix));
    if (other !== value) {
      const label = form.components.get(matches)?.props['label'];
      return message(component, 'matches', options, {
        label: typeof label === 'string' ? label : matches,
      });
    }
  }
  const validatorName = props['validator'];
  if (typeof validatorName === 'string') {
    const validator = options.validators?.[validatorName];
    if (!validator)
      throw new Error(
        `No validator is registered as "${validatorName}" (component "${component.id}")`,
      );
    const result = validator(value, { values, path, component });
    if (result) return result;
  }
  return undefined;
}

function isRequested(
  requested: ReadonlySet<string> | undefined,
  path: string,
  repeaterPath: string | null,
): boolean {
  if (!requested) return true;
  if (requested.has(path)) return true;
  return repeaterPath !== null && requested.has(repeaterPath);
}

/**
 * Validates values against the config: hidden components (including those on
 * hidden pages), disabled and read-only fields are skipped. Errors come back
 * in layout order, one per field (its first failing constraint).
 */
export function validateValues(
  form: CompiledForm,
  values: FormValues,
  options: ValidateOptions = {},
): ValidationResult {
  const requested = options.names
    ? new Set(options.names.map((name) => name.replace(/\.root$/, '')))
    : undefined;
  const pageFilter = options.pages ? new Set(options.pages) : undefined;
  const errors: Record<string, string> = {};

  const check = (
    component: NormalizedComponent,
    rowPrefix: string,
    repeaterPath: string | null,
  ) => {
    const path = form.pathOf(component.id, rowPrefix);
    const wanted = isRequested(requested, path, repeaterPath);
    const isRepeater = component.kind === 'repeater';
    if (!wanted && !(isRepeater && requestsRow(requested, component.id))) return;
    const state = resolveState(form, component.id, values, rowPrefix);
    if (!state.visible) return;
    const value = getAt(values, path);
    if (wanted && !state.disabled && !state.readOnly) {
      const failure = validateField(form, component, value, values, rowPrefix, state, options);
      if (failure !== undefined) errors[path] = failure;
    }
    if (isRepeater && !state.disabled && Array.isArray(value)) {
      value.forEach((_row, index) => {
        const prefix = `${component.id}.${index}.`;
        for (const fieldId of form.itemFields(component.id)) {
          const field = form.components.get(fieldId);
          if (field) check(field, prefix, wanted ? component.id : null);
        }
      });
    }
  };

  for (const page of form.config.pages) {
    if (pageFilter && !pageFilter.has(page.id)) continue;
    if (form.config.mode === 'pages' && !isSelfVisible(form, page.id, values)) continue;
    for (const id of page.fields) {
      const component = form.components.get(id);
      if (component) check(component, '', null);
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function requestsRow(requested: ReadonlySet<string> | undefined, repeaterId: string): boolean {
  if (!requested) return true;
  for (const name of requested) if (name.startsWith(`${repeaterId}.`)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Value effects
// ---------------------------------------------------------------------------

export interface ValueWrite {
  readonly path: string;
  readonly value: unknown;
  /** The dependency that produced it. */
  readonly rule: number;
}

/**
 * Tracks `set` and `clear` rules. A rule fires once each time its condition
 * goes from false to true after a value change; conditions that already hold
 * when the tracker is primed (initial values, reset) do not fire.
 */
export interface EffectTracker {
  /** Records every rule's current state without producing writes. */
  prime(values: FormValues): void;
  /**
   * Re-evaluates the rules a change can affect and returns the writes for
   * rules that just became true, in config order (a later write to the same
   * path wins). `changedPath` undefined means "anything may have changed".
   */
  update(values: FormValues, changedPath?: string): ValueWrite[];
}

export function createEffectTracker(form: CompiledForm): EffectTracker {
  const last = new Map<string, boolean>();
  const rules = form.valueRules;

  const rowPrefixes = (rule: NormalizedDependency, values: FormValues): string[] => {
    if (rule.scope === null) return [''];
    const rows = getAt(values, rule.scope);
    return Array.isArray(rows) ? rows.map((_row, index) => `${rule.scope}.${index}.`) : [];
  };

  const writesFor = (
    rule: NormalizedDependency,
    values: FormValues,
    rowPrefix: string,
  ): ValueWrite[] => {
    const out: ValueWrite[] = [];
    for (const target of rule.targets) {
      const component = form.components.get(target);
      if (!component) continue;
      const value =
        rule.effect === 'set' ? cloneJson(rule.value) : cloneJson(component.value?.empty ?? null);
      if (component.repeater && rule.scope === null) {
        // Sources outside the repeater: the effect applies to every row.
        for (const prefix of rowPrefixes({ ...rule, scope: component.repeater }, values)) {
          out.push({ path: `${prefix}${target}`, value: cloneJson(value), rule: rule.index });
        }
      } else {
        out.push({ path: form.pathOf(target, rowPrefix), value, rule: rule.index });
      }
    }
    return out;
  };

  const sourceId = (path: string): string => {
    const segments = path.split('.');
    return segments[segments.length - 1] as string;
  };

  return {
    prime(values) {
      last.clear();
      for (const rule of rules) {
        for (const prefix of rowPrefixes(rule, values)) {
          last.set(`${rule.index}|${prefix}`, holds(form, rule, values, prefix));
        }
      }
    },
    update(values, changedPath) {
      const writes: ValueWrite[] = [];
      const changed = changedPath === undefined ? undefined : sourceId(changedPath);
      const rowShape =
        changedPath !== undefined && form.components.get(changedPath)?.kind === 'repeater';
      for (const rule of rules) {
        if (
          changed !== undefined &&
          !rule.sources.includes(changed) &&
          !(rowShape && rule.scope === changedPath)
        )
          continue;
        const prefixes = rowPrefixes(rule, values);
        if (rowShape && rule.scope === changedPath) {
          // Rows were added or removed: re-baseline those rows without firing.
          for (const key of [...last.keys()])
            if (key.startsWith(`${rule.index}|`)) last.delete(key);
          for (const prefix of prefixes)
            last.set(`${rule.index}|${prefix}`, holds(form, rule, values, prefix));
          continue;
        }
        for (const prefix of prefixes) {
          const key = `${rule.index}|${prefix}`;
          const now = holds(form, rule, values, prefix);
          const before = last.get(key) ?? false;
          last.set(key, now);
          if (now && !before) writes.push(...writesFor(rule, values, prefix));
        }
      }
      return writes;
    },
  };
}

// ---------------------------------------------------------------------------
// Pages, navigation and submission
// ---------------------------------------------------------------------------

export function visiblePages(form: CompiledForm, values: FormValues): string[] {
  return form.pageOrder.filter(
    (id) => form.config.mode === 'single' || isSelfVisible(form, id, values),
  );
}

/** The next visible page after `current`, or undefined on the last one. */
export function nextPage(
  form: CompiledForm,
  values: FormValues,
  current: string,
): string | undefined {
  const order = form.pageOrder;
  for (let i = order.indexOf(current) + 1; i < order.length; i += 1) {
    const id = order[i] as string;
    if (isSelfVisible(form, id, values)) return id;
  }
  return undefined;
}

export function previousPage(
  form: CompiledForm,
  values: FormValues,
  current: string,
): string | undefined {
  const order = form.pageOrder;
  for (let i = order.indexOf(current) - 1; i >= 0; i -= 1) {
    const id = order[i] as string;
    if (isSelfVisible(form, id, values)) return id;
  }
  return undefined;
}

/**
 * What submitting from a page does:
 * - `final`: deliver all values to the final handler (null means the form's onSubmit)
 * - `step`: deliver this page's (or all) values to the page's handler
 * - null: this page has nothing to submit; only navigation applies
 */
export type PageSubmission =
  | { readonly kind: 'final'; readonly handler: string | null; readonly label: string }
  | {
      readonly kind: 'step';
      readonly handler: string;
      readonly payload: SubmissionPayload;
      readonly label: string;
      readonly isLast: boolean;
    };

export function submissionForPage(
  form: CompiledForm,
  values: FormValues,
  pageId: string,
): PageSubmission | null {
  const { submission, submitLabel } = form.config;
  const isLast = nextPage(form, values, pageId) === undefined;
  if (submission.strategy === 'final') {
    return isLast ? { kind: 'final', handler: submission.handler, label: submitLabel } : null;
  }
  const page = form.page(pageId);
  if (page?.submission) {
    return {
      kind: 'step',
      handler: page.submission.handler,
      payload: page.submission.payload,
      label: page.submission.label,
      isLast,
    };
  }
  return isLast ? { kind: 'final', handler: submission.handler, label: submitLabel } : null;
}

export interface PrepareOptions {
  /** Only values of fields on these pages. */
  readonly pages?: readonly string[];
  /** Overrides the config's `hiddenValues`. */
  readonly hiddenValues?: 'omit' | 'keep';
}

/**
 * The values to hand to a submit handler, as new objects keyed by component
 * id. Hidden components (and hidden pages) are left out unless hiddenValues is
 * "keep"; their values remain in the form's state either way.
 */
export function prepareSubmission<T = FormValues>(
  form: CompiledForm,
  values: FormValues,
  options: PrepareOptions = {},
): T {
  const omit = (options.hiddenValues ?? form.config.hiddenValues) === 'omit';
  const pageFilter = options.pages ? new Set(options.pages) : undefined;
  const out: Record<string, unknown> = {};
  const copy = (value: unknown) =>
    typeof Blob !== 'undefined' && value instanceof Blob ? value : cloneJson(value);
  for (const page of form.config.pages) {
    if (pageFilter && !pageFilter.has(page.id)) continue;
    if (omit && form.config.mode === 'pages' && !isSelfVisible(form, page.id, values)) continue;
    for (const id of page.fields) {
      const component = form.components.get(id);
      if (!component) continue;
      if (omit && !isVisible(form, id, values)) continue;
      const value = getAt(values, id);
      if (component.kind !== 'repeater') {
        out[id] = copy(value);
        continue;
      }
      out[id] = Array.isArray(value)
        ? value.map((_row, index) => {
            const prefix = `${id}.${index}.`;
            const row: Record<string, unknown> = {};
            for (const fieldId of form.itemFields(id)) {
              if (omit && !isVisible(form, fieldId, values, prefix)) continue;
              row[fieldId] = copy(getAt(values, `${prefix}${fieldId}`));
            }
            return row;
          })
        : [];
    }
  }
  return out as T;
}

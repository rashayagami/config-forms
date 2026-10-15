import type { EffectType, JsonValue } from './config.js';

/**
 * The component catalog: a machine-readable description of every component
 * type a configuration may use. The compiler validates configurations against
 * it, and an AI integration can hand a trimmed copy of it to a model. It holds
 * no React code, so it is safe to import on a server.
 */

export type PropType =
  | { readonly kind: 'string' }
  | { readonly kind: 'number' }
  | { readonly kind: 'integer'; readonly min?: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly (string | number)[] }
  /** An ISO date, YYYY-MM-DD. */
  | { readonly kind: 'date' }
  /** A regular expression source string. */
  | { readonly kind: 'regex' }
  /** A list of `{ label, value, description?, disabled? }`. */
  | { readonly kind: 'options'; readonly valueKind: 'string' | 'string-or-number' }
  /** The id of another form component. */
  | { readonly kind: 'fieldRef' }
  /** The name of a validator registered by the application. */
  | { readonly kind: 'validatorRef' }
  /** Message overrides keyed by constraint name. */
  | { readonly kind: 'messages' }
  /** A layout (component ids and layout nodes) placed inside this component. */
  | { readonly kind: 'layout' }
  /** A value of the component's own value type. */
  | { readonly kind: 'value' }
  | { readonly kind: 'json' };

export interface PropSpec {
  readonly type: PropType;
  readonly required?: boolean;
  /** Applied by the compiler when the prop is absent. */
  readonly default?: JsonValue;
  readonly description: string;
}

/**
 * What a form component's value is:
 * - string: `''` when empty
 * - number: a finite number, or `null`
 * - boolean: `true` or `false`
 * - date: `"YYYY-MM-DD"`, or `null`
 * - option: one option value, or `null`
 * - optionList: an array of option values
 * - rows: an array of row objects keyed by the ids of the repeater's item components
 * - json: any JSON value, `null` when empty
 */
export type ValueType =
  'string' | 'number' | 'boolean' | 'date' | 'option' | 'optionList' | 'rows' | 'json';

export interface ValueSpec {
  readonly type: ValueType;
  readonly empty: JsonValue;
}

/**
 * - field: holds a value in the form
 * - repeater: a field whose value is a list of rows, laid out by its `item` prop
 * - display: shows content and holds no value
 * - control: an interactive element that holds no value (a button)
 */
export type ComponentKind = 'field' | 'repeater' | 'display' | 'control';

/** Where a component may be placed: a page or form layout, or a repeater's item layout. */
export type PlacementContext = 'form' | 'repeater';

export interface ComponentSpec {
  readonly type: string;
  readonly description: string;
  readonly kind: ComponentKind;
  readonly props: { readonly [name: string]: PropSpec };
  /** Present for `field` and `repeater` components. */
  readonly value?: ValueSpec;
  readonly events: readonly string[];
  readonly effects: readonly EffectType[];
  readonly accessibility: string;
  /** Whether the component lays out other components (through a `layout` prop). */
  readonly children: boolean;
  readonly contexts: readonly PlacementContext[];
}

export interface Catalog {
  readonly types: readonly string[];
  get(type: string): ComponentSpec | undefined;
  has(type: string): boolean;
  /**
   * A new catalog with these specs added. Re-registering an existing type is an
   * error unless `override` is true, so a typo cannot silently replace a
   * built-in.
   */
  extend(specs: readonly ComponentSpec[], options?: { readonly override?: boolean }): Catalog;
  /** A catalog restricted to these types, e.g. to keep a prompt small. */
  pick(types: readonly string[]): Catalog;
  toJSON(): readonly ComponentSpec[];
}

export function createCatalog(specs: readonly ComponentSpec[]): Catalog {
  const byType = new Map<string, ComponentSpec>();
  for (const spec of specs) {
    if (byType.has(spec.type)) throw new Error(`Component type "${spec.type}" is registered twice`);
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/.test(spec.type)) {
      throw new Error(
        `Component type "${spec.type}" must be lower-case letters, digits and "-", optionally namespaced "app.type"`,
      );
    }
    if ((spec.kind === 'field' || spec.kind === 'repeater') && !spec.value) {
      throw new Error(`Component type "${spec.type}" is a ${spec.kind} and needs a value spec`);
    }
    for (const reserved of ['id', 'type', 'on']) {
      if (reserved in spec.props)
        throw new Error(
          `Component type "${spec.type}" may not declare the reserved prop "${reserved}"`,
        );
    }
    byType.set(spec.type, Object.freeze(spec));
  }
  const types = Object.freeze([...byType.keys()]);
  const catalog: Catalog = {
    types,
    get: (type) => byType.get(type),
    has: (type) => byType.has(type),
    extend: (more, options) => {
      const merged = new Map(byType);
      for (const spec of more) {
        if (merged.has(spec.type) && !options?.override) {
          throw new Error(
            `Component type "${spec.type}" is already registered; pass { override: true } to replace it`,
          );
        }
        merged.set(spec.type, spec);
      }
      return createCatalog([...merged.values()]);
    },
    pick: (wanted) => {
      for (const type of wanted)
        if (!byType.has(type)) throw new Error(`Component type "${type}" is not in the catalog`);
      return createCatalog([...byType.values()].filter((spec) => wanted.includes(spec.type)));
    },
    toJSON: () => [...byType.values()],
  };
  return Object.freeze(catalog);
}

// ---------------------------------------------------------------------------
// Built-in components
// ---------------------------------------------------------------------------

const FIELD_EVENTS = ['change', 'blur'] as const;
const FIELD_EFFECTS: readonly EffectType[] = [
  'show',
  'hide',
  'enable',
  'disable',
  'require',
  'optional',
  'clear',
  'set',
];
const CHOICE_EFFECTS: readonly EffectType[] = [...FIELD_EFFECTS, 'options'];

const str = (description: string, extra: Partial<PropSpec> = {}): PropSpec => ({
  type: { kind: 'string' },
  description,
  ...extra,
});
const bool = (description: string, fallback = false): PropSpec => ({
  type: { kind: 'boolean' },
  default: fallback,
  description,
});
const int = (description: string, extra: Partial<PropSpec> = {}): PropSpec => ({
  type: { kind: 'integer', min: 0 },
  description,
  ...extra,
});

const fieldProps = {
  label: str('Visible label.', { required: true }),
  description: str('Help text under the label.'),
  required: bool('Whether a value is required.'),
  disabled: bool(
    'Whether the control ignores input. Disabled values are kept and submitted, and not validated.',
  ),
  readOnly: bool('Whether the value is shown but cannot be changed.'),
  defaultValue: {
    type: { kind: 'value' },
    description: 'Value before the user changes it.',
  } satisfies PropSpec,
  validator: {
    type: { kind: 'validatorRef' },
    description: 'Name of an application-registered validator.',
  } satisfies PropSpec,
  messages: {
    type: { kind: 'messages' },
    description: 'Error message overrides by constraint: required, minLength, pattern, ...',
  } satisfies PropSpec,
} as const;

const options = (valueKind: 'string' | 'string-or-number'): PropSpec => ({
  type: { kind: 'options', valueKind },
  required: true,
  description: 'Choices as { label, value }.',
});

const field = (
  type: string,
  description: string,
  value: ValueSpec,
  props: Record<string, PropSpec>,
  accessibility: string,
  effects: readonly EffectType[] = FIELD_EFFECTS,
): ComponentSpec => ({
  type,
  description,
  kind: 'field',
  props: { ...fieldProps, ...props },
  value,
  events: FIELD_EVENTS,
  effects,
  accessibility,
  children: false,
  contexts: ['form', 'repeater'],
});

export const builtInComponents: readonly ComponentSpec[] = [
  field(
    'text',
    'Single-line text input.',
    { type: 'string', empty: '' },
    {
      inputType: {
        type: { kind: 'enum', values: ['text', 'email', 'tel', 'url', 'password', 'search'] },
        default: 'text',
        description: 'Keyboard and browser behaviour.',
      },
      placeholder: str('Example input shown while empty.'),
      autoComplete: str('HTML autocomplete token, e.g. "email".'),
      minLength: int('Minimum characters.'),
      maxLength: int('Maximum characters.'),
      pattern: {
        type: { kind: 'regex' },
        description: 'Regular expression the whole value must match.',
      },
      matches: {
        type: { kind: 'fieldRef' },
        description: 'Id of a field this value must equal, e.g. a password confirmation.',
      },
    },
    'Native <input> labelled by its <label>; description and error are linked with aria-describedby; errors are announced.',
  ),
  field(
    'textarea',
    'Multi-line text input.',
    { type: 'string', empty: '' },
    {
      placeholder: str('Example input shown while empty.'),
      rows: int('Visible lines.', { default: 3 }),
      minLength: int('Minimum characters.'),
      maxLength: int('Maximum characters.'),
    },
    'Native <textarea> with label, description and error linked.',
  ),
  field(
    'number',
    'Numeric input with increment and decrement buttons.',
    { type: 'number', empty: null },
    {
      min: { type: { kind: 'number' }, description: 'Smallest allowed value.' },
      max: { type: { kind: 'number' }, description: 'Largest allowed value.' },
      step: {
        type: { kind: 'number' },
        default: 1,
        description: 'Increment for the buttons and arrow keys.',
      },
      placeholder: str('Example input shown while empty.'),
    },
    'Text input with inputmode=decimal; arrow keys step the value; buttons are labelled Increase and Decrease.',
  ),
  field(
    'date',
    'Calendar date input.',
    { type: 'date', empty: null },
    {
      min: { type: { kind: 'date' }, description: 'Earliest date, YYYY-MM-DD.' },
      max: { type: { kind: 'date' }, description: 'Latest date, YYYY-MM-DD.' },
    },
    "Native date input with the browser's accessible picker.",
  ),
  field(
    'select',
    'Choose one option from a list.',
    { type: 'option', empty: null },
    {
      options: options('string-or-number'),
      placeholder: str('Shown while nothing is chosen.', { default: 'Select…' }),
    },
    'Button with aria-haspopup=listbox; arrow keys move, Enter chooses, typing jumps to a match.',
    CHOICE_EFFECTS,
  ),
  field(
    'combobox',
    'Choose one option, typing to filter a long list.',
    { type: 'option', empty: null },
    {
      options: options('string-or-number'),
      placeholder: str('Shown in the empty input.'),
      emptyText: str('Shown when no option matches.', { default: 'No matches' }),
    },
    'Input with role=combobox and a listbox popup; arrow keys move, Enter chooses, Escape closes.',
    CHOICE_EFFECTS,
  ),
  field(
    'multiselect',
    'Choose any number of options from a list.',
    { type: 'optionList', empty: [] },
    {
      options: options('string-or-number'),
      placeholder: str('Shown while nothing is chosen.', { default: 'Select…' }),
      minItems: int('Fewest choices.'),
      maxItems: int('Most choices.'),
    },
    'Listbox with aria-multiselectable; Enter or Space toggles an option.',
    CHOICE_EFFECTS,
  ),
  field(
    'radio',
    'Choose one option, with every option visible.',
    { type: 'option', empty: null },
    {
      options: options('string-or-number'),
      orientation: {
        type: { kind: 'enum', values: ['vertical', 'horizontal'] },
        default: 'vertical',
        description: 'Direction of the options.',
      },
    },
    'role=radiogroup labelled by its legend; arrow keys move between options.',
    CHOICE_EFFECTS,
  ),
  field(
    'checkbox-group',
    'Choose any number of options, with every option visible.',
    { type: 'optionList', empty: [] },
    {
      options: options('string'),
      orientation: {
        type: { kind: 'enum', values: ['vertical', 'horizontal'] },
        default: 'vertical',
        description: 'Direction of the options.',
      },
      minItems: int('Fewest choices.'),
      maxItems: int('Most choices.'),
    },
    'Fieldset with a legend; each option is a native-labelled checkbox.',
    CHOICE_EFFECTS,
  ),
  field(
    'checkbox',
    'A single yes/no box, e.g. accepting terms. When required it must be checked.',
    { type: 'boolean', empty: false },
    {},
    'role=checkbox labelled by the label beside it; Space toggles.',
  ),
  field(
    'switch',
    'An on/off setting that takes effect as a value.',
    { type: 'boolean', empty: false },
    {},
    'role=switch labelled by its label; Space toggles.',
  ),
  {
    type: 'repeater',
    description:
      'A list of rows the user can add and remove; each row holds the components in `item`.',
    kind: 'repeater',
    props: {
      label: str('Legend of the list.', { required: true }),
      description: str('Help text under the legend.'),
      item: {
        type: { kind: 'layout' },
        required: true,
        description: 'Layout of one row: ids of components placed only here.',
      },
      minItems: int('Fewest rows; that many rows are present initially.', { default: 0 }),
      maxItems: int('Most rows.'),
      addLabel: str('Label of the add button.', { default: 'Add' }),
      itemLabel: str('Prefix of each row title, e.g. "Passenger" gives "Passenger 1".', {
        default: 'Item',
      }),
      required: bool('Whether at least one row is required.'),
      disabled: bool('Whether rows can be changed.'),
      messages: {
        type: { kind: 'messages' },
        description: 'Error message overrides: required, minItems, maxItems.',
      },
    },
    value: { type: 'rows', empty: [] },
    events: ['change'],
    effects: ['show', 'hide', 'enable', 'disable', 'require', 'optional', 'clear'],
    accessibility:
      'Fieldset with a legend; each row is a group titled "<itemLabel> n"; Remove buttons name their row.',
    children: true,
    contexts: ['form'],
  },
  {
    type: 'heading',
    description: 'A heading within the form.',
    kind: 'display',
    props: {
      text: str('Heading text.', { required: true }),
      level: {
        type: { kind: 'enum', values: [2, 3, 4] },
        default: 2,
        description: 'Outline level.',
      },
    },
    events: [],
    effects: ['show', 'hide'],
    accessibility: 'Native <h2>–<h4>.',
    children: false,
    contexts: ['form', 'repeater'],
  },
  {
    type: 'paragraph',
    description: 'A paragraph of plain text.',
    kind: 'display',
    props: { text: str('The text.', { required: true }) },
    events: [],
    effects: ['show', 'hide'],
    accessibility: 'Native <p>.',
    children: false,
    contexts: ['form', 'repeater'],
  },
  {
    type: 'alert',
    description: 'A highlighted message.',
    kind: 'display',
    props: {
      text: str('The message.', { required: true }),
      title: str('Short title above the message.'),
      tone: {
        type: { kind: 'enum', values: ['info', 'success', 'warning', 'danger'] },
        default: 'info',
        description: 'Meaning and colour.',
      },
    },
    events: [],
    effects: ['show', 'hide'],
    accessibility: 'role=status for info and success, role=alert for warning and danger.',
    children: false,
    contexts: ['form', 'repeater'],
  },
  {
    type: 'divider',
    description: 'A horizontal rule between content.',
    kind: 'display',
    props: {},
    events: [],
    effects: ['show', 'hide'],
    accessibility: 'Native <hr>.',
    children: false,
    contexts: ['form', 'repeater'],
  },
  {
    type: 'button',
    description:
      'A button that runs a registered action. The form already has Submit and page navigation buttons.',
    kind: 'control',
    props: {
      label: str('Button text.', { required: true }),
      variant: {
        type: { kind: 'enum', values: ['primary', 'secondary'] },
        default: 'secondary',
        description: 'Visual weight.',
      },
    },
    events: ['click'],
    effects: ['show', 'hide', 'enable', 'disable'],
    accessibility: 'Native <button type="button">.',
    children: false,
    contexts: ['form'],
  },
];

export const defaultCatalog: Catalog = createCatalog(builtInComponents);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ArgType = 'pageId' | 'componentId' | 'string' | 'number' | 'boolean';

export interface ArgSpec {
  readonly type: ArgType;
  readonly required?: boolean;
  readonly description: string;
}

/** Where an action may run: a single-page form, a multi-page form, or both. */
export type ActionContext = 'single' | 'pages';

export interface ActionSpec {
  readonly id: string;
  readonly description: string;
  /** Component events that may trigger it. */
  readonly events: readonly string[];
  readonly args: { readonly [name: string]: ArgSpec };
  readonly contexts: readonly ActionContext[];
  /** What running it does, for documentation and prompts. */
  readonly effects: string;
}

export interface ActionCatalog {
  readonly ids: readonly string[];
  get(id: string): ActionSpec | undefined;
  extend(specs: readonly ActionSpec[], options?: { readonly override?: boolean }): ActionCatalog;
  pick(ids: readonly string[]): ActionCatalog;
  toJSON(): readonly ActionSpec[];
}

export function createActionCatalog(specs: readonly ActionSpec[]): ActionCatalog {
  const byId = new Map<string, ActionSpec>();
  for (const spec of specs) {
    if (byId.has(spec.id)) throw new Error(`Action "${spec.id}" is registered twice`);
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(spec.id)) {
      throw new Error(`Action id "${spec.id}" must look like "namespace.name" in lower snake case`);
    }
    byId.set(spec.id, Object.freeze(spec));
  }
  const catalog: ActionCatalog = {
    ids: Object.freeze([...byId.keys()]),
    get: (id) => byId.get(id),
    extend: (more, options) => {
      const merged = new Map(byId);
      for (const spec of more) {
        if (merged.has(spec.id) && !options?.override) {
          throw new Error(
            `Action "${spec.id}" is already registered; pass { override: true } to replace it`,
          );
        }
        merged.set(spec.id, spec);
      }
      return createActionCatalog([...merged.values()]);
    },
    pick: (wanted) =>
      createActionCatalog([...byId.values()].filter((spec) => wanted.includes(spec.id))),
    toJSON: () => [...byId.values()],
  };
  return Object.freeze(catalog);
}

const CLICK = ['click'] as const;

export const builtInActions: readonly ActionSpec[] = [
  {
    id: 'form.validate',
    description: 'Validate every visible field and show errors.',
    events: CLICK,
    args: {},
    contexts: ['single', 'pages'],
    effects: 'Shows errors on invalid fields and focuses the first one. Values are unchanged.',
  },
  {
    id: 'form.validate_and_submit',
    description: 'Validate the whole form and, if valid, deliver the values to the application.',
    events: CLICK,
    args: {},
    contexts: ['single', 'pages'],
    effects:
      "Calls the application's onSubmit with the validated values. Nothing is sent over the network.",
  },
  {
    id: 'form.reset',
    description: 'Restore every field to its initial value.',
    events: CLICK,
    args: {},
    contexts: ['single', 'pages'],
    effects:
      'Values, errors, touched and dirty state return to their initial state; a multi-page form returns to its first page.',
  },
  {
    id: 'navigation.next',
    description: 'Go to the next visible page.',
    events: CLICK,
    args: {},
    contexts: ['pages'],
    effects: 'Validates the current page first unless navigation.validateOnNext is false.',
  },
  {
    id: 'navigation.previous',
    description: 'Go back to the previous visible page.',
    events: CLICK,
    args: {},
    contexts: ['pages'],
    effects: 'Moves back without validating. Values are kept.',
  },
  {
    id: 'navigation.go_to_page',
    description: 'Go to a page by id.',
    events: CLICK,
    args: { page: { type: 'pageId', required: true, description: 'Id of the page to show.' } },
    contexts: ['pages'],
    effects:
      'Moving forward validates the pages in between like Next does; moving back does not validate. A hidden page cannot be the target.',
  },
];

export const defaultActions: ActionCatalog = createActionCatalog(builtInActions);

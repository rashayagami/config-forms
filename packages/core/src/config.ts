/**
 * The authoring format, version 1: the compact JSON an application (or a model
 * generating on its behalf) writes. It names registered component types and
 * their props, places components by id, and declares dependencies and actions.
 * It never carries code, markup or styling.
 *
 * `compileConfig` validates it against a component catalog and produces the
 * complete, normalized runtime form (`NormalizedConfig`).
 */

import type {
  Align,
  Breakpoint,
  Gap,
  Justify,
  MaxWidth,
  Responsive,
  StackBelow,
} from './layout.js';

export const CONFIG_VERSION = 1;
export const SUPPORTED_CONFIG_VERSIONS: readonly number[] = [1];

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type OptionValue = string | number;

export interface Option {
  readonly label: string;
  readonly value: OptionValue;
  readonly description?: string;
  readonly disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type ComparisonOp =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'includes' | 'filled' | 'empty';

/**
 * A condition over form values. `field` is the id of a form component. Inside a
 * repeater item, a field of the same item refers to the same row.
 */
export type Condition =
  | { readonly field: string; readonly op: 'eq' | 'neq'; readonly value: Primitive }
  | {
      readonly field: string;
      readonly op: 'gt' | 'gte' | 'lt' | 'lte';
      readonly value: number | string;
    }
  | { readonly field: string; readonly op: 'in' | 'notIn'; readonly value: readonly Primitive[] }
  /** For multi-choice fields: the chosen values include `value`. */
  | { readonly field: string; readonly op: 'includes'; readonly value: OptionValue }
  | { readonly field: string; readonly op: 'filled' | 'empty' }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition };

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** A call to a registered action, e.g. `{ "action": "navigation.go_to_page", "args": { "page": "review" } }`. */
export interface ActionCall {
  readonly action: string;
  readonly args?: JsonObject;
}

/**
 * One component instance. Besides `id`, `type` and `on`, every key is a prop
 * that the catalog entry for `type` must declare.
 */
export interface ComponentConfig {
  /** Unique across components, layout nodes and pages. For form controls it is also the value key. */
  readonly id: string;
  /** A component type registered in the catalog. */
  readonly type: string;
  /** Actions to run on the component's events, by event name. */
  readonly on?: { readonly [event: string]: ActionCall };
  readonly [prop: string]: JsonValue | { readonly [event: string]: ActionCall } | undefined;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type LayoutType = 'column' | 'row' | 'grid' | 'section' | 'group';

/** A layout node: arranges its children. Styling is fixed by the library. */
export interface LayoutNode {
  readonly type: LayoutType;
  /** Needed only when a dependency targets this node. */
  readonly id?: string;
  /** Heading of a section, legend of a group. */
  readonly title?: string;
  readonly description?: string;
  /**
   * Grid only: columns, 1 to 4. A number means one column on mobile, at most
   * two on tablet and this many on desktop; or give them per breakpoint:
   * { "mobile": 1, "tablet": 2, "desktop": 3 }.
   */
  readonly columns?: Responsive<1 | 2 | 3 | 4>;
  /** Space between children. Default "medium". */
  readonly gap?: Responsive<Gap>;
  /** Row only: below which breakpoint children stack. Default "tablet". */
  readonly stackBelow?: StackBelow;
  /** Row only: cross-axis alignment. Default "stretch". */
  readonly align?: Align;
  /** Row only: main-axis distribution. Default "start". */
  readonly justify?: Justify;
  /** Column, section and group: a readable maximum width. Default "full". */
  readonly maxWidth?: MaxWidth;
  /** Inside a grid: how many columns this node spans. Default 1. */
  readonly span?: Responsive<1 | 2 | 3 | 4>;
  /**
   * Shows the node only at these breakpoints. Only for presentational content:
   * a node holding form fields cannot use it, since a field hidden on one
   * screen size could never be filled in there.
   */
  readonly visibleOn?: readonly Breakpoint[];
  readonly children: readonly LayoutItem[];
}

/** A component id, or a layout node. */
export type LayoutItem = string | LayoutNode;

// ---------------------------------------------------------------------------
// Pages and navigation
// ---------------------------------------------------------------------------

export interface PageConfig {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly layout: readonly LayoutItem[];
  /** Only with `submission.strategy: "perStep"`: what submitting this page does. */
  readonly submission?: PageSubmissionConfig;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * - final: the user completes every page, then one handler receives all values.
 *   Pages validate on Next but submit nothing.
 * - perStep: each page with a `submission` is submitted on its own; its handler
 *   runs when the user submits that page. The last page's handler (or the
 *   form-level `handler`, not both) is the final submission.
 */
export type SubmissionStrategy = 'final' | 'perStep';

/** What a handler receives: only the submitting page's values, or every value so far. */
export type SubmissionPayload = 'page' | 'all';

export interface SubmissionConfig {
  /** Default `final`. */
  readonly strategy?: SubmissionStrategy;
  /**
   * Name of a submit handler the application registers. Under `final` it
   * receives all values; when omitted, the form's `onSubmit` callback does.
   * Under `perStep` it is the final handler, used only when the last page has none.
   */
  readonly handler?: string;
  /** `perStep` only: default payload for page handlers. Default `page`. */
  readonly payload?: SubmissionPayload;
  /** `perStep` only: move to the next page after a page submits successfully. Default true. */
  readonly advanceOnSuccess?: boolean;
  /** `perStep` only: whether Next is blocked until a page with a handler has submitted. Default true. */
  readonly requireStepSubmission?: boolean;
}

export interface PageSubmissionConfig {
  readonly handler: string;
  /** Overrides `submission.payload` for this page. */
  readonly payload?: SubmissionPayload;
  /** Label of this page's submit button. Default "Save and continue", or the form's submitLabel on the last page. */
  readonly label?: string;
}

export interface NavigationConfig {
  /** Default `steps`. */
  readonly progress?: 'steps' | 'bar' | 'none';
  /** Whether Previous is offered. Default true. */
  readonly allowBack?: boolean;
  /** Whether Next validates the current page first. Default true. */
  readonly validateOnNext?: boolean;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * State effects hold while their condition is true:
 * - show / hide, enable / disable, require / optional
 * - options: replaces the target's options with `options`
 *
 * Value effects run once each time their condition becomes true after a change:
 * - clear: sets the target to its empty value
 * - set: sets the target to `value`
 */
export type EffectType =
  'show' | 'hide' | 'enable' | 'disable' | 'require' | 'optional' | 'options' | 'clear' | 'set';

export interface DependencyConfig {
  readonly when: Condition;
  readonly effect: EffectType;
  /** A component, layout node or page id, or several. */
  readonly target: string | readonly string[];
  /** For `set`: the value to write. */
  readonly value?: JsonValue;
  /** For `options`: the options to offer while the condition holds. */
  readonly options?: readonly Option[];
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface FormConfig {
  readonly version: 1;
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly components: readonly ComponentConfig[];
  /** A single-page form's layout. Use either `layout` or `pages`. */
  readonly layout?: readonly LayoutItem[];
  /** A multi-page form's pages, in order. */
  readonly pages?: readonly PageConfig[];
  readonly navigation?: NavigationConfig;
  readonly dependencies?: readonly DependencyConfig[];
  /** Values by component id; they override each component's `defaultValue`. */
  readonly initialValues?: JsonObject;
  /** When fields are first validated. Default `submit`. */
  readonly validateOn?: 'submit' | 'blur' | 'change';
  /** Whether hidden components' values are left out of submitted values. Default `omit`. */
  readonly hiddenValues?: 'omit' | 'keep';
  /**
   * Name of a theme the application registers with its ThemeProvider. Optional:
   * the form renders with the surrounding theme when omitted, and the
   * application can restyle it without changing this config.
   */
  readonly theme?: string;
  /** How and when values are handed to the application. */
  readonly submission?: SubmissionConfig;
  /** Label of the built-in submit button. Default "Submit". */
  readonly submitLabel?: string;
  /** Whether a Reset button is shown beside Submit. Default false. */
  readonly showReset?: boolean;
}

/** Keeps the literal types of an authored config, for `InferValues`. */
export function defineConfig<const C extends FormConfig>(config: C): C {
  return config;
}

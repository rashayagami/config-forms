export type IssueCode =
  | 'invalid_json'
  | 'invalid_type'
  | 'missing_property'
  | 'unknown_property'
  | 'unsupported_version'
  | 'invalid_id'
  | 'duplicate_id'
  | 'unknown_component_type'
  | 'invalid_prop'
  | 'invalid_value'
  | 'unknown_reference'
  | 'invalid_layout'
  | 'invalid_nesting'
  | 'invalid_context'
  | 'duplicate_placement'
  | 'unplaced_component'
  | 'invalid_condition'
  | 'unsupported_effect'
  | 'ambiguous_row_reference'
  | 'self_dependency'
  | 'dependency_cycle'
  | 'conflicting_effects'
  | 'unknown_event'
  | 'unknown_action'
  | 'invalid_action_args'
  | 'invalid_action_context'
  | 'incompatible_submission'
  | 'unknown_handler'
  | 'unused_handler'
  | 'limit_exceeded';

/** Which part of a configuration an issue belongs to, so a generator can repair just that part. */
export type IssueTarget =
  | { readonly kind: 'root' }
  | { readonly kind: 'component'; readonly id: string; readonly index: number }
  | { readonly kind: 'layout' }
  | { readonly kind: 'page'; readonly id: string; readonly index: number }
  | { readonly kind: 'dependency'; readonly index: number }
  | { readonly kind: 'submission' }
  | { readonly kind: 'initialValues' };

export interface ConfigIssue {
  readonly severity: 'error' | 'warning';
  readonly code: IssueCode;
  /** JSON Pointer to the offending value, e.g. "/components/3/options/0/value". */
  readonly path: string;
  readonly target: IssueTarget;
  readonly componentId?: string;
  readonly pageId?: string;
  readonly message: string;
  /** What would have been valid, e.g. `one of "text", "number"`. */
  readonly expected?: string;
  /** A concrete correction, when one is likely. */
  readonly suggestion?: string;
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];
  constructor(issues: readonly ConfigIssue[]) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    const first = errors[0];
    super(
      first
        ? `Invalid form configuration: ${first.message} (at ${first.path || '/'})` +
            (errors.length > 1 ? ` and ${errors.length - 1} more error(s)` : '')
        : 'Invalid form configuration',
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export function pointer(base: string, key: string | number): string {
  return `${base}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[cols - 1] as number;
}

/**
 * Words a generator commonly writes for a canonical term. Only used to suggest
 * a correction: the compiler never accepts a synonym in place of the term.
 */
const SYNONYMS: Readonly<Record<string, string>> = {
  equals: 'eq',
  equal: 'eq',
  is: 'eq',
  '==': 'eq',
  '===': 'eq',
  notequals: 'neq',
  not_equals: 'neq',
  '!=': 'neq',
  '!==': 'neq',
  greaterthan: 'gt',
  '>': 'gt',
  '>=': 'gte',
  lessthan: 'lt',
  '<': 'lt',
  '<=': 'lte',
  contains: 'includes',
  exists: 'filled',
  notempty: 'filled',
  isempty: 'empty',
  oneof: 'in',
  reveal: 'show',
  visible: 'show',
  display: 'show',
  hidden: 'hide',
  enabled: 'enable',
  disabled: 'disable',
  required: 'require',
  mandatory: 'require',
  notrequired: 'optional',
  reset: 'clear',
  setvalue: 'set',
  stack: 'column',
  vertical: 'column',
  container: 'column',
  horizontal: 'row',
  fieldset: 'group',
  card: 'section',
  press: 'click',
  tap: 'click',
  onclick: 'click',
  onchange: 'change',
  onblur: 'blur',
  phone: 'mobile',
  small: 'mobile',
  sm: 'mobile',
  md: 'tablet',
  medium: 'tablet',
  lg: 'desktop',
  large: 'desktop',
  laptop: 'desktop',
  xl: 'desktop',
};

/** The closest candidate to `input`, if it is close enough to be a likely typo. */
export function closest(input: string, candidates: Iterable<string>): string | undefined {
  const pool = [...candidates];
  const synonym = SYNONYMS[input.toLowerCase()];
  if (synonym !== undefined && pool.includes(synonym)) return synonym;
  let best: string | undefined;
  let bestScore = Infinity;
  const lower = input.toLowerCase();
  for (const candidate of pool) {
    const score = distance(lower, candidate.toLowerCase());
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best !== undefined && bestScore <= Math.max(2, Math.floor(input.length / 3))
    ? best
    : undefined;
}

export function quoteList(values: Iterable<unknown>): string {
  return [...values].map((value) => JSON.stringify(value)).join(', ');
}

/**
 * Responsive layout. Breakpoints are widths of the form's own container (CSS
 * container queries), not of the viewport, so a form adapts the same way in a
 * full page, a sidebar or a dialog. Everything here is CSS: no resize
 * listeners, and a breakpoint change never re-renders the form.
 */

export const BREAKPOINTS = ['mobile', 'tablet', 'desktop'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

/** Minimum container widths in px where `tablet` and `desktop` start; `mobile` is everything below `tablet`. */
export interface BreakpointConfig {
  readonly tablet: number;
  readonly desktop: number;
}

export const defaultBreakpoints: BreakpointConfig = Object.freeze({ tablet: 640, desktop: 1024 });

/** A value for all sizes, or per breakpoint; a missing breakpoint inherits from the next smaller one (mobile first). */
export type Responsive<T> = T | { readonly mobile?: T; readonly tablet?: T; readonly desktop?: T };
export type Resolved<T> = { readonly mobile: T; readonly tablet: T; readonly desktop: T };

export type Gap = 'none' | 'small' | 'medium' | 'large';
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type MaxWidth = 'narrow' | 'medium' | 'wide' | 'full';
/** Rows stack their children below this breakpoint; `never` keeps them side by side (wrapping when tight). */
export type StackBelow = 'tablet' | 'desktop' | 'never';

/** Resolves a responsive value mobile-first: each breakpoint takes its own value or the one below it. */
export function resolveResponsive<T>(
  value: Responsive<T> | undefined,
  fallback: Resolved<T>,
): Resolved<T> {
  if (value === undefined) return fallback;
  if (typeof value !== 'object' || value === null)
    return { mobile: value as T, tablet: value as T, desktop: value as T };
  const v = value as { mobile?: T; tablet?: T; desktop?: T };
  const mobile = v.mobile ?? fallback.mobile;
  const tablet = v.tablet ?? (v.mobile !== undefined ? mobile : fallback.tablet);
  const desktop =
    v.desktop ?? (v.tablet !== undefined || v.mobile !== undefined ? tablet : fallback.desktop);
  return { mobile, tablet, desktop };
}

/**
 * Grid columns from a single number: one column on mobile, at most two on
 * tablet, the number itself on desktop. A per-breakpoint object is taken as given.
 */
export function resolveColumns(value: Responsive<number> | undefined): Resolved<number> {
  if (typeof value === 'number') return { mobile: 1, tablet: Math.min(value, 2), desktop: value };
  return resolveResponsive(value, { mobile: 1, tablet: 2, desktop: 2 });
}

export function checkBreakpoints(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null)
    return 'breakpoints must be { "tablet": number, "desktop": number }';
  const { tablet, desktop } = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(value)) {
    if (key !== 'tablet' && key !== 'desktop')
      return `Unknown breakpoint "${key}"; use "tablet" and "desktop"`;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 200 || v > 4000)
      return `"${key}" must be a whole number of px between 200 and 4000`;
  }
  if (typeof tablet === 'number' && typeof desktop === 'number' && tablet >= desktop)
    return '"tablet" must be smaller than "desktop"';
  return undefined;
}

const GAP_VALUE: Record<Gap, string> = {
  none: '0',
  small: 'var(--fc-space-2)',
  medium: 'var(--fc-space-4)',
  large: 'var(--fc-space-6)',
};

/** Inline custom properties for a resolved gap (values come from a fixed table). */
export function gapVars(gap: Resolved<Gap>): Record<string, string> {
  return {
    '--fc-gap-mobile': GAP_VALUE[gap.mobile],
    '--fc-gap-tablet': GAP_VALUE[gap.tablet],
    '--fc-gap-desktop': GAP_VALUE[gap.desktop],
  };
}

/**
 * The breakpoint-dependent CSS: layouts, the footer and the progress
 * indicator. `scope` restricts it to `[data-fc-layout="<scope>"]`, which is
 * how custom breakpoints apply to one ThemeProvider or form; without a scope
 * this is the library's default stylesheet.
 */
export function layoutCss(
  breakpoints: BreakpointConfig = defaultBreakpoints,
  scope?: string,
): string {
  if (scope !== undefined && !/^[A-Za-z0-9_-]+$/.test(scope))
    throw new Error(`Invalid layout scope "${scope}"`);
  const problem = checkBreakpoints(breakpoints);
  if (problem) throw new Error(problem);
  const s = (selector: string) =>
    selector
      .split(',')
      .map((part) => (scope ? `[data-fc-layout="${scope}"] ${part.trim()}` : part.trim()))
      .join(', ');
  const at = (min: number, rules: string) => `@container fc (min-width: ${min}px) {\n${rules}\n}`;
  const below = (max: number, rules: string) =>
    `@container fc (max-width: ${max - 0.02}px) {\n${rules}\n}`;
  const perBreakpoint = (breakpoint: Breakpoint) => `
  ${s('.fc-grid')} { grid-template-columns: repeat(var(--fc-cols-${breakpoint}, 1), minmax(0, 1fr)); }
  ${s('.fc-grid > [data-span]')} { grid-column: span min(var(--fc-span-${breakpoint}, 1), var(--fc-cols-${breakpoint}, 1)); }
  ${s('[data-gap]')} { gap: var(--fc-gap-${breakpoint}); }`;
  // Visibility uses exact ranges, so hiding on one size never hides on another.
  const range = (min: number | null, max: number | null) =>
    [
      min !== null ? `(min-width: ${min}px)` : '',
      max !== null ? `(max-width: ${max - 0.02}px)` : '',
    ]
      .filter(Boolean)
      .join(' and ');
  const hide = (breakpoint: Breakpoint, query: string) =>
    `@container fc ${query} {\n  ${s(`[data-hide-${breakpoint}]`)} { display: none; }\n}`;
  return [
    `/* Generated by layoutCss(${JSON.stringify(breakpoints)}). */`,
    perBreakpoint('mobile').trim(),
    at(breakpoints.tablet, perBreakpoint('tablet')),
    at(breakpoints.desktop, perBreakpoint('desktop')),
    hide('mobile', range(null, breakpoints.tablet)),
    hide('tablet', range(breakpoints.tablet, breakpoints.desktop)),
    hide('desktop', range(breakpoints.desktop, null)),
    // Rows: stacked below their threshold, side by side (wrapping) above it.
    // Side by side, each child gets a 12rem basis so a crowded row wraps instead of squeezing.
    `${s('.fc-row')} { flex-direction: column; }`,
    `${s('.fc-row[data-stack-below="never"]')} { flex-direction: row; --fc-row-basis: 12rem; }`,
    at(
      breakpoints.tablet,
      `  ${s('.fc-row:not([data-stack-below="desktop"])')} { flex-direction: row; --fc-row-basis: 12rem; }`,
    ),
    at(breakpoints.desktop, `  ${s('.fc-row')} { flex-direction: row; --fc-row-basis: 12rem; }`),
    // Footer actions: stacked full width with the primary on top on mobile.
    at(
      breakpoints.tablet,
      `  ${s('.fc-footer-actions')} { flex-direction: row; justify-content: flex-end; }
  ${s('.fc-footer-actions .fc-button')} { width: auto; }`,
    ),
    // Step list: on mobile only the current step is listed, with "n of m".
    below(
      breakpoints.tablet,
      `  ${s('.fc-step:not([data-state="current"])')} { display: none; }
  ${s('.fc-step-count')} { display: inline; }`,
    ),
    // Read-only answers: label beside value from tablet up.
    at(
      breakpoints.tablet,
      `  ${s('.fc-response-item')} { grid-template-columns: minmax(8rem, 14rem) minmax(0, 1fr); gap: var(--fc-space-4); }`,
    ),
  ].join('\n');
}

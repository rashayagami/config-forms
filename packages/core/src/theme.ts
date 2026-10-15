/**
 * Application themes as JSON. A theme names semantic colors and radii; the
 * library turns it into CSS custom properties (`--fc-*`) that every built-in
 * component reads. Themes are independent of form configurations: a config
 * may name a registered theme, and an application can restyle every form
 * without regenerating any config.
 */
import { closest, quoteList } from './issues.js';
import { isPlainObject } from './values.js';

export const COLOR_TOKENS = [
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'background',
  'foreground',
  'surface',
  'surfaceForeground',
  'muted',
  'mutedForeground',
  'border',
  'input',
  'ring',
  'success',
  'warning',
  'danger',
  'info',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Tokens a theme must define; every other token has a fallback. */
export const REQUIRED_COLOR_TOKENS: readonly ColorToken[] = [
  'primary',
  'primaryForeground',
  'background',
  'foreground',
];

export const RADIUS_TOKENS = ['small', 'medium', 'large'] as const;
export type RadiusToken = (typeof RADIUS_TOKENS)[number];

export interface ThemeConfig {
  /** Identifies the theme, e.g. for a form config's `"theme"`. */
  readonly name: string;
  /** Light colors. `primary`, `primaryForeground`, `background` and `foreground` are required. */
  readonly colors: Partial<Record<ColorToken, string>>;
  /** Colors for dark mode. `background` and `foreground` are required; other tokens fall back (see `resolveTheme`). */
  readonly dark?: { readonly colors: Partial<Record<ColorToken, string>> };
  readonly radius?: Partial<Record<RadiusToken, string>>;
}

/**
 * Fallbacks for optional tokens, as CSS that refers to other tokens, so they
 * follow whatever the theme sets (including its dark colors).
 */
const DERIVED: Readonly<Partial<Record<ColorToken, string>>> = {
  secondary: 'color-mix(in srgb, var(--fc-foreground) 8%, var(--fc-background))',
  secondaryForeground: 'var(--fc-foreground)',
  surface: 'var(--fc-background)',
  surfaceForeground: 'var(--fc-foreground)',
  muted: 'color-mix(in srgb, var(--fc-foreground) 5%, var(--fc-background))',
  mutedForeground: 'color-mix(in srgb, var(--fc-foreground) 62%, var(--fc-background))',
  border: 'color-mix(in srgb, var(--fc-foreground) 18%, var(--fc-background))',
  input: 'var(--fc-border)',
  ring: 'var(--fc-primary)',
};

/** Fallbacks for status colors, chosen for contrast on light and on dark backgrounds. */
const STATUS_FALLBACKS: Readonly<Record<'light' | 'dark', Partial<Record<ColorToken, string>>>> = {
  light: { success: '#15803d', warning: '#b45309', danger: '#dc2626', info: '#0369a1' },
  dark: { success: '#4ade80', warning: '#fbbf24', danger: '#f87171', info: '#38bdf8' },
};

const RADIUS_FALLBACKS: Record<RadiusToken, string> = {
  small: '4px',
  medium: '6px',
  large: '10px',
};

export interface ThemeIssue {
  readonly code:
    | 'invalid_type'
    | 'missing_token'
    | 'unknown_token'
    | 'invalid_color'
    | 'invalid_length'
    | 'invalid_name';
  /** JSON Pointer into the theme, e.g. "/colors/primary". */
  readonly path: string;
  readonly message: string;
  readonly expected?: string;
  readonly suggestion?: string;
}

export class ThemeError extends Error {
  readonly issues: readonly ThemeIssue[];
  constructor(issues: readonly ThemeIssue[]) {
    super(
      `Invalid theme: ${issues[0]?.message ?? 'unknown problem'}${issues.length > 1 ? ` and ${issues.length - 1} more` : ''}`,
    );
    this.name = 'ThemeError';
    this.issues = issues;
  }
}

/** A validated theme with every token resolved to a CSS value. */
export interface ResolvedTheme {
  readonly name: string;
  readonly light: Readonly<Record<ColorToken, string>>;
  /** Null when the theme defines no dark colors: it then looks the same in dark mode. */
  readonly dark: Readonly<Record<ColorToken, string>> | null;
  readonly radius: Readonly<Record<RadiusToken, string>>;
}

export type ParseThemeResult =
  | { readonly ok: true; readonly theme: ResolvedTheme }
  | { readonly ok: false; readonly issues: readonly ThemeIssue[] };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// Color functions with plain numeric arguments only: no nested functions, var() or url().
const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[-+0-9.%a-z\s,/]*\)$/i;
const NAMED = new Set(['transparent', 'black', 'white', 'currentcolor']);
const LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em))$/;
const THEME_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** Whether a string is a color this library will place in CSS. */
export function isSafeColor(value: string): boolean {
  return (
    HEX.test(value) ||
    NAMED.has(value.toLowerCase()) ||
    (COLOR_FUNCTION.test(value) && !/url|var|expression/i.test(value))
  );
}

export const cssVar = (token: ColorToken | `radius-${RadiusToken}`): string =>
  `--fc-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

function checkColors(
  raw: unknown,
  path: string,
  required: readonly ColorToken[],
  issues: ThemeIssue[],
): Partial<Record<ColorToken, string>> {
  const out: Partial<Record<ColorToken, string>> = {};
  if (!isPlainObject(raw)) {
    issues.push({
      code: 'invalid_type',
      path,
      message: `"${path.split('/').pop()}" must be an object of colors`,
      expected: `{ ${REQUIRED_COLOR_TOKENS.map((t) => `"${t}": "#..."`).join(', ')} }`,
    });
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(COLOR_TOKENS as readonly string[]).includes(key)) {
      const near = closest(key, COLOR_TOKENS);
      issues.push({
        code: 'unknown_token',
        path: `${path}/${key}`,
        message: `Unknown color token "${key}"`,
        expected: quoteList(COLOR_TOKENS),
        ...(near ? { suggestion: `Did you mean "${near}"?` } : {}),
      });
      continue;
    }
    if (typeof value !== 'string' || !isSafeColor(value.trim())) {
      issues.push({
        code: 'invalid_color',
        path: `${path}/${key}`,
        message: `"${key}" is not a supported color: ${JSON.stringify(value)}`,
        expected: 'a hex color like "#7C3AED", or rgb(), hsl(), oklch() with plain values',
      });
      continue;
    }
    out[key as ColorToken] = value.trim();
  }
  for (const token of required) {
    if (out[token] === undefined && !issues.some((issue) => issue.path === `${path}/${token}`)) {
      issues.push({
        code: 'missing_token',
        path: `${path}/${token}`,
        message: `Missing required color "${token}"`,
        expected: 'a color',
      });
    }
  }
  return out;
}

/**
 * Validates a theme and resolves every token:
 * - light: the given color, else the derived fallback, else the status default;
 * - dark: the dark color, else (for derived tokens) the same derivation from
 *   the dark base colors, else the light color for the four required tokens
 *   (dark falls back to light for primary and primaryForeground), else the
 *   dark status default;
 * - radius: the given length, else the library default.
 *
 * Accepts the theme object itself or a document `{ "theme": { ... } }`.
 */
export function parseTheme(input: unknown): ParseThemeResult {
  const issues: ThemeIssue[] = [];
  const raw =
    isPlainObject(input) && isPlainObject(input['theme']) && Object.keys(input).length === 1
      ? input['theme']
      : input;
  const base = raw === input ? '' : '/theme';
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      issues: [
        {
          code: 'invalid_type',
          path: base,
          message: 'A theme must be an object',
          expected: '{ "name", "colors", "dark"?, "radius"? }',
        },
      ],
    };
  }
  for (const key of Object.keys(raw)) {
    if (!['name', 'colors', 'dark', 'radius'].includes(key)) {
      const near = closest(key, ['name', 'colors', 'dark', 'radius']);
      issues.push({
        code: 'unknown_token',
        path: `${base}/${key}`,
        message: `Unknown theme property "${key}"`,
        ...(near ? { suggestion: `Did you mean "${near}"?` } : {}),
      });
    }
  }
  const name = raw['name'];
  if (typeof name !== 'string' || !THEME_NAME.test(name)) {
    issues.push({
      code: 'invalid_name',
      path: `${base}/name`,
      message: 'A theme needs a "name" of letters, digits and "-"',
      expected: '"my-company"',
    });
  }
  const light = checkColors(raw['colors'], `${base}/colors`, REQUIRED_COLOR_TOKENS, issues);
  let dark: Partial<Record<ColorToken, string>> | null = null;
  if (raw['dark'] !== undefined) {
    const rawDark = raw['dark'];
    if (!isPlainObject(rawDark)) {
      issues.push({
        code: 'invalid_type',
        path: `${base}/dark`,
        message: '"dark" must be { "colors": { ... } }',
      });
    } else {
      for (const key of Object.keys(rawDark)) {
        if (key !== 'colors')
          issues.push({
            code: 'unknown_token',
            path: `${base}/dark/${key}`,
            message: `Unknown property "${key}" in "dark"`,
            suggestion: 'Put dark colors under "dark": { "colors": { ... } }.',
          });
      }
      dark = checkColors(
        rawDark['colors'],
        `${base}/dark/colors`,
        ['background', 'foreground'],
        issues,
      );
    }
  }
  const radius: Record<RadiusToken, string> = { ...RADIUS_FALLBACKS };
  if (raw['radius'] !== undefined) {
    if (!isPlainObject(raw['radius'])) {
      issues.push({
        code: 'invalid_type',
        path: `${base}/radius`,
        message: '"radius" must be an object',
      });
    } else {
      for (const [key, value] of Object.entries(raw['radius'])) {
        if (!(RADIUS_TOKENS as readonly string[]).includes(key)) {
          const near = closest(key, RADIUS_TOKENS);
          issues.push({
            code: 'unknown_token',
            path: `${base}/radius/${key}`,
            message: `Unknown radius "${key}"`,
            expected: quoteList(RADIUS_TOKENS),
            ...(near ? { suggestion: `Did you mean "${near}"?` } : {}),
          });
        } else if (typeof value !== 'string' || !LENGTH.test(value)) {
          issues.push({
            code: 'invalid_length',
            path: `${base}/radius/${key}`,
            message: `"${key}" must be a length like "8px" or "0.5rem"`,
            expected: 'px, rem or em',
          });
        } else {
          radius[key as RadiusToken] = value;
        }
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const resolve = (
    given: Partial<Record<ColorToken, string>>,
    scheme: 'light' | 'dark',
    fallback?: Partial<Record<ColorToken, string>>,
  ) => {
    const out = {} as Record<ColorToken, string>;
    for (const token of COLOR_TOKENS) {
      out[token] =
        given[token] ??
        DERIVED[token] ??
        fallback?.[token] ??
        STATUS_FALLBACKS[scheme][token] ??
        (light[token] as string);
    }
    return out;
  };
  const resolvedLight = resolve(light, 'light');
  const resolvedDark = dark
    ? resolve(dark, 'dark', {
        primary: light.primary as string,
        primaryForeground: light.primaryForeground as string,
      })
    : null;
  return {
    ok: true,
    theme: Object.freeze({
      name: name as string,
      light: Object.freeze(resolvedLight),
      dark: resolvedDark && Object.freeze(resolvedDark),
      radius: Object.freeze(radius),
    }),
  };
}

/** Like `parseTheme`, but throws a `ThemeError`. */
export function assertTheme(input: unknown): ResolvedTheme {
  const result = parseTheme(input);
  if (!result.ok) throw new ThemeError(result.issues);
  return result.theme;
}

function declarations(
  colors: Readonly<Record<ColorToken, string>>,
  radius?: Readonly<Record<RadiusToken, string>>,
): string {
  const lines = COLOR_TOKENS.map((token) => `${cssVar(token)}:${colors[token]};`);
  if (radius)
    for (const token of RADIUS_TOKENS) lines.push(`${cssVar(`radius-${token}`)}:${radius[token]};`);
  return lines.join('');
}

/**
 * CSS that applies a theme to elements matching `[data-fc-theme="<scope>"]`.
 * `data-fc-scheme` on the same element picks light, dark or the system
 * setting. Values come only from a validated theme, so they cannot break out
 * of their declarations. Nothing outside the scope is styled.
 */
export function themeToCss(theme: ResolvedTheme, scope: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(scope)) throw new Error(`Invalid theme scope "${scope}"`);
  const selector = `[data-fc-theme="${scope}"]`;
  const light = `${selector}{${declarations(theme.light, theme.radius)}color-scheme:light;}`;
  if (!theme.dark) return light;
  const dark = declarations(theme.dark);
  return [
    light,
    `${selector}[data-fc-scheme="dark"]{${dark}color-scheme:dark;}`,
    `@media (prefers-color-scheme: dark){${selector}[data-fc-scheme="system"]{${dark}color-scheme:dark;}}`,
  ].join('\n');
}

/** CSS variable references for every token, for styling custom components. */
export const themeVars: Readonly<
  Record<ColorToken, string> & Record<`radius${Capitalize<RadiusToken>}`, string>
> = Object.freeze({
  ...(Object.fromEntries(COLOR_TOKENS.map((token) => [token, `var(${cssVar(token)})`])) as Record<
    ColorToken,
    string
  >),
  radiusSmall: `var(${cssVar('radius-small')})`,
  radiusMedium: `var(${cssVar('radius-medium')})`,
  radiusLarge: `var(${cssVar('radius-large')})`,
});

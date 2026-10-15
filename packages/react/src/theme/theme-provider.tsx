'use client';
import {
  assertTheme,
  checkBreakpoints,
  layoutCss,
  themeToCss,
  themeVars,
  type BreakpointConfig,
  type ResolvedTheme,
  type ThemeConfig,
} from '@form-config/core';
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';

/** A theme as JSON: the theme object, or a document `{ "theme": { ... } }`. */
export type ThemeInput =
  ThemeConfig | { readonly theme: ThemeConfig } | Readonly<Record<string, unknown>>;
/** A theme, or the name of one registered with the surrounding ThemeProvider. */
export type ThemeSelection = ThemeInput | string;
export type ColorScheme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  readonly theme: ResolvedTheme | null;
  readonly scheme: ColorScheme;
  readonly themes: Readonly<Record<string, ResolvedTheme>>;
  readonly breakpoints: BreakpointConfig | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  scheme: 'system',
  themes: {},
  breakpoints: null,
});
const PortalContext = createContext<HTMLElement | null>(null);

const resolvedCache = new WeakMap<object, ResolvedTheme>();
/** Validates a theme once per object; throws a ThemeError listing every problem. */
function resolveInput(input: ThemeInput): ResolvedTheme {
  let resolved = resolvedCache.get(input);
  if (!resolved) {
    resolved = assertTheme(input);
    resolvedCache.set(input, resolved);
  }
  return resolved;
}

const scopeFrom = (id: string) => `t${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

function ThemeStyle({ theme, scope }: { readonly theme: ResolvedTheme; readonly scope: string }) {
  // Values come from a validated theme only (see isSafeColor), so this text cannot escape its rules.
  return <style data-fc-theme-style={theme.name}>{themeToCss(theme, scope)}</style>;
}

function validBreakpoints(breakpoints: BreakpointConfig | undefined): BreakpointConfig | undefined {
  if (!breakpoints) return undefined;
  const problem = checkBreakpoints(breakpoints);
  if (problem) throw new Error(`form-config: invalid breakpoints: ${problem}`);
  return breakpoints;
}

/** Breakpoint rules for custom breakpoints, scoped to one provider or form. Plain numbers only. */
function LayoutStyle({
  breakpoints,
  scope,
}: {
  readonly breakpoints: BreakpointConfig;
  readonly scope: string;
}) {
  return <style data-fc-layout-style="">{layoutCss(breakpoints, scope)}</style>;
}

export interface ThemeProviderProps {
  /** The theme for everything inside. Without one, the library's default palette applies. */
  readonly theme?: ThemeInput;
  /** Themes that form configs may name with `"theme": "<name>"`. */
  readonly themes?: readonly ThemeInput[];
  /** Default `system`. Changing it, or the theme, restyles in place without remounting forms. */
  readonly colorScheme?: ColorScheme;
  /** Container widths (px) where tablet and desktop layouts start. Default { tablet: 640, desktop: 1024 }. */
  readonly breakpoints?: BreakpointConfig;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * Applies a JSON theme to the forms inside it by setting `--fc-*` custom
 * properties on its own wrapper element. It never styles anything outside
 * that element. Create theme objects once (or memoize them): a theme is
 * validated once per object.
 */
export function ThemeProvider({
  theme,
  themes,
  colorScheme = 'system',
  breakpoints,
  className,
  children,
}: ThemeProviderProps) {
  const parent = useContext(ThemeContext);
  const resolved = theme ? resolveInput(theme) : null;
  const ownBreakpoints = validBreakpoints(breakpoints);
  const registered = useMemo(() => {
    const out: Record<string, ResolvedTheme> = { ...parent.themes };
    for (const input of themes ?? []) {
      const entry = resolveInput(input);
      out[entry.name] = entry;
    }
    return out;
  }, [parent.themes, themes]);
  const scope = scopeFrom(useId());
  const value = useMemo(
    () => ({
      theme: resolved ?? parent.theme,
      scheme: colorScheme,
      themes: resolved ? { ...registered, [resolved.name]: resolved } : registered,
      breakpoints: ownBreakpoints ?? parent.breakpoints,
    }),
    [resolved, parent.theme, parent.breakpoints, colorScheme, registered, ownBreakpoints],
  );
  return (
    <ThemeContext.Provider value={value}>
      <div
        className={className ? `fc-theme ${className}` : 'fc-theme'}
        data-fc-theme={resolved ? scope : undefined}
        data-fc-scheme={colorScheme}
        data-fc-layout={ownBreakpoints ? scope : undefined}
      >
        {resolved ? <ThemeStyle theme={resolved} scope={scope} /> : null}
        {ownBreakpoints ? <LayoutStyle breakpoints={ownBreakpoints} scope={scope} /> : null}
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/**
 * The root element of one form: applies a scoped theme override when given,
 * and holds the container that the form's popups render into, so menus and
 * listboxes carry the same theme as the form.
 */
export function ScopedTheme({
  theme,
  colorScheme,
  breakpoints,
  children,
}: {
  readonly theme: ThemeSelection | undefined;
  readonly colorScheme: ColorScheme | undefined;
  readonly breakpoints?: BreakpointConfig | undefined;
  readonly children: ReactNode;
}) {
  const parent = useContext(ThemeContext);
  const ownBreakpoints = validBreakpoints(breakpoints);
  const scope = scopeFrom(useId());
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  let resolved: ResolvedTheme | null = null;
  if (typeof theme === 'string') {
    resolved = parent.themes[theme] ?? null;
    if (!resolved && parent.theme?.name !== theme) {
      console.warn(
        `form-config: no theme named "${theme}" is registered with a ThemeProvider; using the surrounding theme`,
      );
    }
  } else if (theme) {
    resolved = resolveInput(theme);
  }
  const scheme = colorScheme ?? parent.scheme;
  const value = useMemo(
    () => ({
      theme: resolved ?? parent.theme,
      scheme,
      themes: parent.themes,
      breakpoints: ownBreakpoints ?? parent.breakpoints,
    }),
    [resolved, parent, scheme, ownBreakpoints],
  );
  return (
    <ThemeContext.Provider value={value}>
      <PortalContext.Provider value={portal}>
        <div
          className="fc-root"
          data-fc-theme={resolved ? scope : undefined}
          data-fc-scheme={scheme}
          data-fc-layout={ownBreakpoints ? scope : undefined}
        >
          {resolved ? <ThemeStyle theme={resolved} scope={scope} /> : null}
          {ownBreakpoints ? <LayoutStyle breakpoints={ownBreakpoints} scope={scope} /> : null}
          <div className="fc-container">{children}</div>
          {/* Outside the query container, so popups are positioned against the page, not the form. */}
          <div className="fc-portal" ref={setPortal} />
        </div>
      </PortalContext.Provider>
    </ThemeContext.Provider>
  );
}

/** Where a form's popups render. */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContext);
}

export interface ThemeInfo {
  /** The active theme's name, or null for the library default. */
  readonly name: string | null;
  readonly scheme: ColorScheme;
  /** Custom breakpoints in effect, or null for the defaults. */
  readonly breakpoints: BreakpointConfig | null;
  /** `var(--fc-*)` references for every token; they follow light/dark switching. */
  readonly vars: typeof themeVars;
  /** The resolved token values (CSS), or null for the library default. */
  readonly theme: ResolvedTheme | null;
}

/** The active theme, for custom components that style themselves with its tokens. */
export function useTheme(): ThemeInfo {
  const { theme, scheme, breakpoints } = useContext(ThemeContext);
  return { name: theme?.name ?? null, scheme, breakpoints, vars: themeVars, theme };
}

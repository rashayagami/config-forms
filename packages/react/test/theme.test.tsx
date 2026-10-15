import { layoutCss, parseTheme, ThemeError } from '@form-config/core';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SchemaForm, ThemeProvider, useTheme } from '../src/index.js';
import { eventRegistration, renderStrict } from './helpers.js';

const company = {
  theme: {
    name: 'my-company',
    colors: {
      primary: '#7C3AED',
      primaryForeground: '#FFFFFF',
      background: '#FFFFFF',
      foreground: '#18181B',
      border: '#E4E4E7',
      danger: '#DC2626',
    },
    dark: { colors: { background: '#09090B', foreground: '#FAFAFA', primary: '#A78BFA' } },
    radius: { small: '4px', medium: '8px', large: '12px' },
  },
};
const ocean = {
  name: 'ocean',
  colors: {
    primary: '#0E7490',
    primaryForeground: '#FFFFFF',
    background: '#F0FDFF',
    foreground: '#083344',
  },
};

const styleText = () =>
  [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
const form = (container: HTMLElement) => container.querySelector('.fc-root') as HTMLElement;

describe('ThemeProvider', () => {
  it('turns a JSON theme into scoped CSS variables', () => {
    const { container } = renderStrict(
      <ThemeProvider theme={company}>
        <SchemaForm config={eventRegistration} onSubmit={() => {}} />
      </ThemeProvider>,
    );
    const wrapper = container.querySelector('.fc-theme') as HTMLElement;
    const scope = wrapper.dataset['fcTheme'];
    expect(scope).toMatch(/^t/);
    const css = styleText();
    expect(css).toContain(`[data-fc-theme="${scope}"]{--fc-primary:#7C3AED;`);
    expect(css).toContain('--fc-radius-medium:8px;');
    // An optional token the theme left out falls back to a derivation from its own colors.
    expect(css).toContain('--fc-surface:var(--fc-background);');
    expect(css).toContain(
      `[data-fc-theme="${scope}"][data-fc-scheme="dark"]{--fc-primary:#A78BFA;`,
    );
    // Nothing outside the scope is targeted.
    expect(css.split('\n').every((rule) => rule.includes(`[data-fc-theme="${scope}"]`))).toBe(true);
  });

  it('switches light and dark at runtime without remounting the form', async () => {
    function App({ scheme }: { readonly scheme: 'light' | 'dark' }) {
      return (
        <ThemeProvider theme={company} colorScheme={scheme}>
          <SchemaForm config={eventRegistration} onSubmit={() => {}} />
        </ThemeProvider>
      );
    }
    const { user, rerender, container } = renderStrict(<App scheme="light" />);
    const input = screen.getByRole('textbox', { name: /Full name/ });
    await user.type(input, 'Kept');
    rerender(<App scheme="dark" />);
    expect(container.querySelector('.fc-theme')).toHaveAttribute('data-fc-scheme', 'dark');
    expect(screen.getByRole('textbox', { name: /Full name/ })).toBe(input);
    expect(input).toHaveValue('Kept');
  });

  it('applies a scoped theme to one form, by object or by registered name', () => {
    const named = { ...eventRegistration, theme: 'ocean' };
    const { container } = renderStrict(
      <ThemeProvider theme={company} themes={[ocean]}>
        <SchemaForm config={eventRegistration} onSubmit={() => {}} />
        <SchemaForm config={named} onSubmit={() => {}} />
        <SchemaForm config={eventRegistration} theme={ocean} onSubmit={() => {}} />
      </ThemeProvider>,
    );
    const roots = [...container.querySelectorAll('.fc-root')] as HTMLElement[];
    expect(roots[0]).not.toHaveAttribute('data-fc-theme');
    expect(roots[1]?.dataset['fcTheme']).toBeTruthy();
    expect(roots[2]?.dataset['fcTheme']).toBeTruthy();
    expect(styleText()).toContain(
      `[data-fc-theme="${roots[1]?.dataset['fcTheme']}"]{--fc-primary:#0E7490;`,
    );
  });

  it('warns and inherits when a config names an unregistered theme', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderStrict(
      <SchemaForm config={{ ...eventRegistration, theme: 'missing' }} onSubmit={() => {}} />,
    );
    expect(form(container)).not.toHaveAttribute('data-fc-theme');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no theme named "missing"'));
  });

  it('rejects an invalid theme with a ThemeError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderStrict(
        <ThemeProvider theme={{ name: 'x', colors: { primary: 'red;}body{display:none' } }} />,
      ),
    ).toThrow(ThemeError);
  });

  it('gives custom components the resolved theme', () => {
    function Probe() {
      const theme = useTheme();
      return (
        <span
          data-testid="probe"
          data-name={theme.name ?? ''}
          data-primary={theme.vars.primary}
          data-value={theme.theme?.light.primary ?? ''}
        />
      );
    }
    renderStrict(
      <ThemeProvider theme={company}>
        <Probe />
      </ThemeProvider>,
    );
    const probe = screen.getByTestId('probe');
    expect(probe).toHaveAttribute('data-name', 'my-company');
    expect(probe).toHaveAttribute('data-primary', 'var(--fc-primary)');
    expect(probe).toHaveAttribute('data-value', '#7C3AED');
  });

  it('applies custom breakpoints as scoped container queries', () => {
    const { container } = renderStrict(
      <ThemeProvider breakpoints={{ tablet: 500, desktop: 900 }}>
        <SchemaForm config={eventRegistration} onSubmit={() => {}} />
      </ThemeProvider>,
    );
    const scope = (container.querySelector('.fc-theme') as HTMLElement).dataset['fcLayout'];
    expect(styleText()).toMatch(
      new RegExp(
        `@container fc \\(min-width: 500px\\) \\{\\s+\\[data-fc-layout="${scope}"\\] \\.fc-grid`,
      ),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderStrict(<ThemeProvider breakpoints={{ tablet: 900, desktop: 500 }} />),
    ).toThrow('"tablet" must be smaller');
  });
});

describe('theme JSON', () => {
  it('reports every problem with a path', () => {
    const result = parseTheme({
      theme: {
        name: 'bad name',
        colors: { primary: 'url(x)', primaryForegroud: '#fff', background: '#fff' },
        radius: { medium: '8' },
      },
    });
    if (result.ok) throw new Error('expected errors');
    expect(result.issues.map((i) => [i.code, i.path, i.suggestion])).toEqual([
      ['invalid_name', '/theme/name', undefined],
      ['invalid_color', '/theme/colors/primary', undefined],
      ['unknown_token', '/theme/colors/primaryForegroud', 'Did you mean "primaryForeground"?'],
      ['missing_token', '/theme/colors/primaryForeground', undefined],
      ['missing_token', '/theme/colors/foreground', undefined],
      ['invalid_length', '/theme/radius/medium', undefined],
    ]);
  });

  it('fills dark tokens from dark base colors, not from light overrides', () => {
    const result = parseTheme({
      name: 't',
      colors: {
        primary: '#111',
        primaryForeground: '#fff',
        background: '#fff',
        foreground: '#000',
        surface: '#fafafa',
      },
      dark: { colors: { background: '#000', foreground: '#fff' } },
    });
    if (!result.ok) throw new Error('invalid');
    expect(result.theme.light.surface).toBe('#fafafa');
    expect(result.theme.dark?.surface).toBe('var(--fc-background)');
    expect(result.theme.dark?.primary).toBe('#111');
    expect(result.theme.dark?.danger).toBe('#f87171');
  });
});

describe('built-in stylesheet', () => {
  const tokens = readFileSync(resolve('src/styles/tokens.css'), 'utf8');
  const components = readFileSync(resolve('src/styles/components.css'), 'utf8');

  it('styles components only through tokens: no literal colors outside the default palette', () => {
    const literal = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
    const offending = components.split('\n').filter((line) => literal.test(line));
    expect(offending).toEqual([]);
    expect(tokens).toMatch(/--fc-primary: #/);
  });

  it('scopes every rule to library classes, so host elements are untouched', () => {
    const selectors = [
      ...components.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|})\s*([^{}@]+)\{/g),
    ].map((m) => (m[2] ?? '').trim());
    const unscoped = selectors
      .filter((s) => s && !/^(from|to|\d+%)$/.test(s))
      .filter((s) =>
        s
          .replace(/\([^)]*\)/g, '')
          .split(',')
          .some((part) => !/(\.fc-|\[data-)/.test(part)),
      );
    expect(unscoped).toEqual([]);
    expect(selectors.length).toBeGreaterThan(100);
  });

  it('declares each top-level selector once, so no rule silently overrides another', () => {
    const css = components.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors: string[] = [];
    let depth = 0;
    let buffer = '';
    for (const ch of css) {
      if (ch === '{') {
        if (depth === 0) selectors.push(buffer.trim());
        depth += 1;
        buffer = '';
      } else if (ch === '}') {
        depth -= 1;
        buffer = '';
      } else if (depth === 0) buffer += ch;
    }
    const duplicates = selectors.filter((selector, index) => selectors.indexOf(selector) !== index);
    expect(duplicates).toEqual([]);
  });

  it('has no viewport media queries for layout; breakpoints are container queries from layoutCss()', () => {
    expect(components.match(/@media[^{]*/g)).toEqual(['@media (prefers-reduced-motion: reduce) ']);
    expect(layoutCss()).toContain('@container fc (min-width: 640px)');
    expect(layoutCss()).toContain('@container fc (min-width: 1024px)');
  });
});

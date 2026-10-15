import { describe, expect, it } from 'vitest';
import {
  compileConfig,
  layoutCss,
  resolveColumns,
  resolveResponsive,
  type NormalizedLayoutNode,
} from '../src/index.js';
import { base, compiled, errorsOf } from './helpers.js';

describe('responsive values', () => {
  it('resolve mobile first: a missing breakpoint inherits from the one below', () => {
    const fallback = { mobile: 'medium', tablet: 'medium', desktop: 'medium' } as const;
    expect(resolveResponsive('small', fallback)).toEqual({
      mobile: 'small',
      tablet: 'small',
      desktop: 'small',
    });
    expect(resolveResponsive({ tablet: 'large' }, fallback)).toEqual({
      mobile: 'medium',
      tablet: 'large',
      desktop: 'large',
    });
    expect(resolveResponsive({ mobile: 'none', desktop: 'large' }, fallback)).toEqual({
      mobile: 'none',
      tablet: 'none',
      desktop: 'large',
    });
  });

  it('treat a single column count as "one on mobile, at most two on tablet"', () => {
    expect(resolveColumns(4)).toEqual({ mobile: 1, tablet: 2, desktop: 4 });
    expect(resolveColumns(1)).toEqual({ mobile: 1, tablet: 1, desktop: 1 });
    expect(resolveColumns({ mobile: 2, desktop: 3 })).toEqual({ mobile: 2, tablet: 2, desktop: 3 });
  });
});

describe('compileConfig: responsive layout props', () => {
  const layoutOf = (layout: unknown[]) =>
    compiled(base({ layout })).config.pages[0]?.layout as NormalizedLayoutNode[];

  it('normalizes every layout node with complete per-breakpoint values', () => {
    const [grid] = layoutOf([
      { type: 'grid', columns: 3, gap: { mobile: 'small' }, children: ['name', 'kind'] },
    ]);
    expect(grid).toMatchObject({
      type: 'grid',
      columns: { mobile: 1, tablet: 2, desktop: 3 },
      gap: { mobile: 'small', tablet: 'small', desktop: 'small' },
      maxWidth: 'full',
      visibleOn: ['mobile', 'tablet', 'desktop'],
    });
    const [row] = layoutOf([
      { type: 'row', stackBelow: 'desktop', align: 'end', children: ['name', 'kind'] },
    ]);
    expect(row).toMatchObject({ stackBelow: 'desktop', align: 'end', justify: 'start' });
  });

  it('rejects props on node types they do not apply to, with a hint', () => {
    const issues = errorsOf(
      base({
        layout: [{ type: 'column', columns: 2, stackBelow: 'tablet', children: ['name', 'kind'] }],
      }),
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['unknown_property', '/layout/0/columns'],
      ['unknown_property', '/layout/0/stackBelow'],
    ]);
  });

  it('rejects unknown breakpoints and out-of-range values', () => {
    const issues = errorsOf(
      base({
        layout: [
          {
            type: 'grid',
            columns: { phone: 1 },
            children: ['name', { type: 'column', span: 5, children: ['kind'] }],
          },
        ],
      }),
    );
    expect(issues.map((i) => [i.code, i.path, i.suggestion])).toEqual([
      ['invalid_value', '/layout/0/columns/phone', 'Did you mean "mobile"?'],
      ['invalid_value', '/layout/0/children/1/span', undefined],
    ]);
  });

  it('only allows span directly inside a grid', () => {
    expect(
      errorsOf(base({ layout: [{ type: 'column', span: 2, children: ['name', 'kind'] }] }))[0],
    ).toMatchObject({ code: 'unknown_property', path: '/layout/0/span' });
  });

  it('does not let visibleOn hide a form field', () => {
    const config = (children: unknown[]) =>
      base({
        components: [
          { id: 'name', type: 'text', label: 'Name' },
          { id: 'tip', type: 'paragraph', text: 'Tip for wide screens.' },
        ],
        layout: ['name', { type: 'column', visibleOn: ['desktop'], children }],
      });
    expect(compileConfig(config(['tip'])).ok).toBe(true);
    const issues = errorsOf(
      base({
        components: [
          { id: 'name', type: 'text', label: 'Name' },
          { id: 'tip', type: 'paragraph', text: 'Tip' },
        ],
        layout: ['tip', { type: 'column', visibleOn: ['desktop'], children: ['name'] }],
      }),
    );
    expect(issues[0]).toMatchObject({
      code: 'invalid_layout',
      componentId: 'name',
      path: '/layout/1/visibleOn',
    });
  });
});

describe('layoutCss', () => {
  it('generates container queries at the configured breakpoints, optionally scoped', () => {
    const css = layoutCss({ tablet: 600, desktop: 1200 }, 'abc');
    expect(css).toContain('@container fc (min-width: 600px)');
    expect(css).toContain('@container fc (min-width: 1200px)');
    expect(css).toContain('[data-fc-layout="abc"] .fc-grid');
    expect(css).not.toContain('@media');
    expect(() => layoutCss({ tablet: 600, desktop: 1200 }, 'x"]{}')).toThrow(
      'Invalid layout scope',
    );
    expect(() => layoutCss({ tablet: 1200, desktop: 600 })).toThrow('smaller');
  });

  it('hides by exact ranges so a node hidden on one size shows on the others', () => {
    const css = layoutCss();
    expect(css).toContain(
      '@container fc (max-width: 639.98px) {\n  [data-hide-mobile] { display: none; }',
    );
    expect(css).toContain(
      '@container fc (min-width: 640px) and (max-width: 1023.98px) {\n  [data-hide-tablet] { display: none; }',
    );
    expect(css).toContain(
      '@container fc (min-width: 1024px) {\n  [data-hide-desktop] { display: none; }',
    );
  });
});

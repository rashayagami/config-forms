/**
 * Deterministic configs for benchmarks and tests. Not part of the main entry,
 * so it never reaches an application bundle unless imported from
 * "@form-config/core/testing".
 */
import type { ComponentConfig, DependencyConfig, FormConfig, LayoutItem } from './config.js';

/**
 * A form of `fields` value components: four in five text inputs, one in five
 * selects, grouped ten to a section in two-column rows, with every tenth
 * field required and every fifth one shown only while the field before it is
 * filled. The same `fields` always produces the same config.
 */
export function generateLargeConfig(fields: number): FormConfig {
  const components: ComponentConfig[] = [];
  const layout: LayoutItem[] = [];
  const dependencies: DependencyConfig[] = [];
  for (let section = 0; section * 10 < fields; section += 1) {
    const children: LayoutItem[] = [];
    for (let i = section * 10; i < Math.min(fields, section * 10 + 10); i += 2) {
      const pair: string[] = [];
      for (const n of [i, i + 1]) {
        if (n >= fields) continue;
        const id = `f${n}`;
        components.push(
          n % 5 === 4
            ? {
                id,
                type: 'select',
                label: `Choice ${n}`,
                options: [
                  { label: 'Alpha', value: 'a' },
                  { label: 'Beta', value: 'b' },
                  { label: 'Gamma', value: 'c' },
                ],
              }
            : { id, type: 'text', label: `Field ${n}`, required: n % 10 === 0 },
        );
        if (n % 5 === 3 && n > 0) {
          dependencies.push({
            when: { field: `f${n - 1}`, op: 'filled' },
            effect: 'show',
            target: id,
          });
        }
        pair.push(id);
      }
      children.push(pair.length === 2 ? { type: 'row', children: pair } : (pair[0] as string));
    }
    layout.push({ type: 'section', title: `Section ${section + 1}`, children });
  }
  return { version: 1, id: `large${fields}`, components, layout, dependencies };
}

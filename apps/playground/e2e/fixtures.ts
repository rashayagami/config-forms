import { test as base, expect, type Page } from '@playwright/test';

/** Console errors, warnings and page errors from the first byte of every page, so nothing stale is read. */
export const test = base.extend<{ problems: string[] }>({
  problems: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
    });
    await use(problems);
  },
});

export { expect };

/** How far the document is wider than the viewport (0 means no horizontal page scroll). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Elements inside the nth match of `selector` that stick out past its right edge (ignoring visually hidden inputs). */
export async function overflowingChildren(
  page: Page,
  selector: string,
  index = 0,
): Promise<string[]> {
  return page.evaluate(
    ([sel, nth]) => {
      const root = document.querySelectorAll(sel)[nth];
      if (!root) return [`missing ${sel} #${nth}`];
      const limit = root.getBoundingClientRect().right + 1;
      return [...root.querySelectorAll<HTMLElement>('*')]
        .filter((el) => {
          const style = getComputedStyle(el);
          if (
            style.position === 'fixed' ||
            style.clip === 'rect(0px, 0px, 0px, 0px)' ||
            el.getAttribute('aria-hidden') === 'true'
          )
            return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > limit;
        })
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)} limit=${Math.round(limit)}`,
        );
    },
    [selector, index] as const,
  );
}

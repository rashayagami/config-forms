import { expect, horizontalOverflow, overflowingChildren, test } from './fixtures';

const viewports = [
  { name: '320 mobile', width: 320, height: 640 },
  { name: '375 mobile', width: 375, height: 812 },
  { name: '768 tablet', width: 768, height: 1024 },
  { name: '1024 laptop', width: 1024, height: 768 },
  { name: '1440 desktop', width: 1440, height: 900 },
];

const pages = [
  '/examples/event-registration',
  '/examples/pet-adoption',
  '/examples/trip-booking',
  '/custom',
  '/embedded',
  '/editor',
];

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of pages) {
      test(`${path}: no page overflow, nothing past the form's edge, no console problems`, async ({
        page,
        problems,
      }) => {
        await page.goto(path);
        await expect(page.locator('form.fc-form').first()).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        const roots = await page.locator('.fc-root').count();
        expect(roots).toBeGreaterThan(0);
        for (let index = 0; index < roots; index += 1) {
          expect(await overflowingChildren(page, '.fc-root', index)).toEqual([]);
        }
        expect(problems).toEqual([]);
      });
    }

    test('every footer action is reachable and inside the viewport', async ({ page }) => {
      await page.goto('/examples/trip-booking');
      const next = page.getByRole('button', { name: 'Next' });
      await next.scrollIntoViewIfNeeded();
      const box = await next.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    });

    test('a select popup stays inside the viewport', async ({ page }) => {
      await page.goto('/examples/pet-adoption');
      await page.getByRole('textbox', { name: /Your name/ }).fill('Sam');
      await page.getByRole('textbox', { name: /Phone/ }).fill('+44 20 7946 0000');
      await page.getByRole('textbox', { name: /Age/ }).fill('30');
      await page.getByRole('button', { name: 'Save and continue' }).click();
      const trigger = page.getByRole('combobox', { name: /Housing/ });
      await trigger.click();
      const list = page.getByRole('listbox');
      await expect(list).toBeVisible();
      const box = await list.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      await page.getByRole('option', { name: 'I rent' }).click();
      await expect(page.getByRole('checkbox', { name: /landlord/ })).toBeVisible();
    });
  });
}

test.describe('layout adapts to the container, not the window', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a row stacks in a 300px sidebar and sits side by side in a wide column at the same window size', async ({
    page,
  }) => {
    await page.goto('/embedded');
    const sidebarGrid = page.getByTestId('sidebar').locator('.fc-grid').first();
    const columns = await sidebarGrid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
    );
    expect(columns).toBe(1);
    const mainRow = page.getByTestId('main').locator('.fc-row').first();
    expect(await mainRow.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');
    // Long labels and URLs wrap inside the sidebar-width form instead of widening it.
    expect(await overflowingChildren(page, '[data-testid="main"] .fc-root')).toEqual([]);
  });

  test('the step list collapses to the current step on a narrow form', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/examples/pet-adoption');
    // Steps hidden with display:none leave the accessibility tree, so count the DOM items.
    const steps = page.getByRole('navigation', { name: 'Progress' }).locator('li');
    await expect(steps).toHaveCount(3);
    expect(
      await steps.evaluateAll(
        (items) => items.filter((li) => getComputedStyle(li).display !== 'none').length,
      ),
    ).toBe(1);
    await expect(page.getByText('(1 of 3)')).toBeVisible();
    // Only the current step's number carries the primary colour.
    const backgrounds = await page
      .locator('.fc-step-number')
      .evaluateAll((numbers) => numbers.map((n) => getComputedStyle(n).backgroundColor));
    expect(new Set(backgrounds.slice(1)).has(backgrounds[0] ?? '')).toBe(false);
    // Wide again: every step is listed and the count is hidden, with no reload.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
      page.getByRole('navigation', { name: 'Progress' }).getByRole('listitem'),
    ).toHaveCount(3);
    await expect(page.getByText('(1 of 3)')).toBeHidden();
  });
});

test.describe('multi-step forms across a resize', () => {
  test('values survive resizing and moving between pages', async ({ page, problems }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/examples/trip-booking');
    await page.getByRole('combobox', { name: /Destination/ }).fill('Osl');
    await page.getByRole('option', { name: 'Oslo' }).click();
    await page.getByRole('combobox', { name: /Cabin/ }).click();
    await page.getByRole('option', { name: 'Economy' }).click();
    await page.getByLabel(/Departure/).fill('2026-11-02');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: /Name/ }).fill('Ada');
    await page.getByRole('textbox', { name: /Age/ }).fill('36');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByRole('combobox', { name: /Destination/ })).toHaveValue('Oslo');
    await expect(page.getByLabel(/Departure/)).toHaveValue('2026-11-02');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('textbox', { name: /Name/ })).toHaveValue('Ada');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Book trip' }).click();
    await expect(page.getByRole('heading', { name: 'Book a trip' })).toBeVisible();
    await expect(page.getByTestId('Handler calls')).toContainText('"travellerName": "Ada"');
    expect(problems).toEqual([]);
  });
});

test.describe('keyboard', () => {
  test('tab order reaches every control and focus is visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/examples/event-registration');
    await page.getByRole('textbox', { name: /Full name/ }).focus();
    const outlines: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      outlines.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const style = getComputedStyle(el);
          return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
            ? 'visible'
            : `invisible ${el.tagName}.${el.className}`;
        }),
      );
    }
    expect(outlines.every((o) => o === 'visible')).toBe(true);
    // Arrow keys move within the radio group.
    await page.getByRole('radio', { name: /One day/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /Full conference/ })).toBeFocused();
  });
});

test.describe('themes', () => {
  test('a JSON theme restyles built-in components and leaves the host page alone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/examples/event-registration');
    const submit = page.getByRole('button', { name: 'Register' });
    const hostHeader = page.locator('.pg-header');
    const before = await hostHeader.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByLabel('Theme').selectOption('my-company');
    await expect
      .poll(() => submit.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(124, 58, 237)');
    expect(await submit.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('8px');
    expect(await hostHeader.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
    await page.getByRole('textbox', { name: /Full name/ }).fill('Kept');
    await page.getByLabel('Colour scheme').selectOption('dark');
    await expect
      .poll(() => submit.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(167, 139, 250)');
    await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Kept');
  });
});

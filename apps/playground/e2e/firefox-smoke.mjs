// Firefox check over WebDriver BiDi, using the installed Firefox and a scratch profile.
// Usage: node e2e/firefox-smoke.mjs [baseUrl]   (default http://localhost:3100)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:3100';
const profile = mkdtempSync(join(tmpdir(), 'fc-firefox-'));
const browser = await puppeteer.launch({
  browser: 'firefox',
  protocol: 'webDriverBiDi',
  executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox',
  userDataDir: profile,
  headless: true,
});

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
};

try {
  for (const width of [320, 375, 768, 1024, 1440]) {
    for (const path of [
      '/examples/event-registration',
      '/examples/pet-adoption',
      '/examples/trip-booking',
      '/embedded',
      '/custom',
    ]) {
      const page = await browser.newPage();
      const problems = [];
      page.on('console', (m) => ['error', 'warn'].includes(m.type()) && problems.push(m.text()));
      page.on('pageerror', (e) => problems.push(e.message));
      await page.setViewport({ width, height: 800 });
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForSelector('form.fc-form');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      check(overflow <= 0, `${width}px ${path}: no horizontal overflow (${overflow})`);
      check(
        problems.length === 0,
        `${width}px ${path}: no console problems ${problems.join(' | ')}`,
      );
      await page.close();
    }
  }

  // Container queries: the same row stacks in the sidebar and not in the main column.
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/embedded`, { waitUntil: 'load' });
  const directions = await page.evaluate(() => ({
    sidebarGridColumns: getComputedStyle(
      document.querySelector('[data-testid="sidebar"] .fc-grid'),
    ).gridTemplateColumns.split(' ').length,
    mainRow: getComputedStyle(document.querySelector('[data-testid="main"] .fc-row')).flexDirection,
  }));
  check(
    directions.sidebarGridColumns === 1 && directions.mainRow === 'row',
    `container queries: ${JSON.stringify(directions)}`,
  );

  // A full submission through the UI.
  await page.goto(`${base}/examples/event-registration`, { waitUntil: 'load' });
  await page
    .locator('::-p-aria(Full name *)')
    .fill('Ada Lovelace')
    .catch(async () => page.type('input[name="fullName"]', 'Ada Lovelace'));
  await page.type('input[name="email"]', 'ada@example.com');
  await page
    .click('button[role="radio"][value="full"], [role="radio"]:nth-of-type(1)')
    .catch(() => {});
  await page.evaluate(() => {
    const radio = [...document.querySelectorAll('[role="radio"]')].find((r) =>
      r.closest('label')?.textContent?.includes('Full conference'),
    );
    radio?.click();
    const terms = [...document.querySelectorAll('[role="checkbox"]')].find((c) =>
      c.closest('label')?.textContent?.includes('code of conduct'),
    );
    terms?.click();
  });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Register')?.click(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="Handler calls"]')
        ?.textContent?.includes('Ada Lovelace'),
    { timeout: 10_000 },
  );
  check(true, 'submitted the event registration through the UI');
} catch (error) {
  failures.push(String(error));
  console.log('FAIL', error);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall Firefox checks passed');
process.exit(failures.length ? 1 : 0);

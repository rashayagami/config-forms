// Rendering cost in Chrome against the playground's production build.
// Needs the playground built (`pnpm --filter playground build`); starts it on port 3102.
// Measures: time to first render of the form, time from a keystroke to the next
// frame, and how many text fields re-rendered for that keystroke.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const SIZES = [10, 100, 500, 1000];
const LOADS = 5;
const KEYSTROKES = 20;
const PORT = 3102;
const playground = fileURLToPath(new URL('../apps/playground/', import.meta.url));

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: playground,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (chunk) => String(chunk).includes('Ready') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
  setTimeout(() => reject(new Error('server did not start')), 30_000);
});

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const size of SIZES) {
    const mounts = [];
    const updates = [];
    let rerenderedPerKeystroke = 0;
    for (let load = 0; load < LOADS; load += 1) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://localhost:${PORT}/large?fields=${size}`);
      await page.waitForFunction(() => window.__fcBench !== undefined);
      mounts.push(await page.evaluate(() => window.__fcBench.mountMs));
      if (load === 0) {
        const input = page.getByRole('textbox', { name: 'Field 1', exact: true });
        await input.click();
        const before = await page.evaluate(() => ({ ...window.__fcBench.renders }));
        for (let i = 0; i < KEYSTROKES; i += 1) {
          // From the input event to the next animation frame after React commits.
          const ms = await input.evaluate(
            (el) =>
              new Promise((resolve) => {
                const start = performance.now();
                const setter = Object.getOwnPropertyDescriptor(
                  HTMLInputElement.prototype,
                  'value',
                ).set;
                setter.call(el, el.value + 'x');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve(performance.now() - start)),
                );
              }),
          );
          updates.push(ms);
        }
        const after = await page.evaluate(() => ({ ...window.__fcBench.renders }));
        const changed = Object.keys(after).filter((name) => after[name] !== before[name]);
        rerenderedPerKeystroke = changed.length;
      }
      await page.close();
    }
    results.push({
      fields: size,
      mountMedianMs: +median(mounts).toFixed(1),
      keystrokeToFrameMedianMs: +median(updates).toFixed(2),
      textFieldsRerenderedByTyping: rerenderedPerKeystroke,
    });
  }
} finally {
  await browser.close();
  server.kill();
}

const environment = {
  browser: `Chrome ${browser.version()}`,
  build: 'next build (production)',
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  loads: LOADS,
  keystrokes: KEYSTROKES,
  date: new Date().toISOString(),
};
console.table(results);
console.log(environment);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('./results/browser.json', import.meta.url),
  JSON.stringify({ environment, results }, null, 2) + '\n',
);

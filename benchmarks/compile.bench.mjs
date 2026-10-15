// Schema compilation and value validation in Node, on generated configs.
// Run with: node --expose-gc compile.bench.mjs   (or `pnpm benchmark` from the root)
import { compileConfig, createEffectTracker, validateValues } from '@form-config/core';
import { generateLargeConfig } from '@form-config/core/testing';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

const SIZES = [10, 100, 500, 1000];
const RUNS = 30;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
const time = (fn) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

function filledValues(form) {
  const values = form.getInitialValues();
  for (const key of Object.keys(values)) if (values[key] === '') values[key] = `value ${key}`;
  return values;
}

const results = [];
for (const size of SIZES) {
  // Warm up the JIT on a throwaway config of the same size.
  for (let i = 0; i < 5; i += 1) compileConfig(generateLargeConfig(size));

  const compile = [];
  const heap = [];
  let form;
  for (let i = 0; i < RUNS; i += 1) {
    const config = generateLargeConfig(size); // a new object each run, so the cache never hits
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    let result;
    compile.push(time(() => (result = compileConfig(config))));
    heap.push(process.memoryUsage().heapUsed - before);
    if (!result.ok) throw new Error(`generated config ${size} is invalid`);
    form = result.form;
  }

  const config = generateLargeConfig(size);
  compileConfig(config);
  const cached = [];
  for (let i = 0; i < RUNS; i += 1) cached.push(time(() => compileConfig(config)));

  const values = filledValues(form);
  const full = [];
  const one = [];
  const effects = [];
  const tracker = createEffectTracker(form);
  tracker.prime(values);
  for (let i = 0; i < RUNS; i += 1) {
    full.push(time(() => validateValues(form, values)));
    one.push(time(() => validateValues(form, values, { names: [`f${Math.floor(size / 2)}`] })));
    effects.push(time(() => tracker.update(values, `f${Math.floor(size / 2)}`)));
  }

  results.push({
    fields: size,
    compileMedianMs: +median(compile).toFixed(3),
    compileP95Ms: +p95(compile).toFixed(3),
    cachedCompileMedianMs: +median(cached).toFixed(4),
    validateAllMedianMs: +median(full).toFixed(3),
    validateOneFieldMedianMs: +median(one).toFixed(4),
    effectUpdateMedianMs: +median(effects).toFixed(4),
    compileHeapMedianKb: globalThis.gc ? Math.round(median(heap) / 1024) : null,
  });
}

const environment = {
  node: process.version,
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  runs: RUNS,
  date: new Date().toISOString(),
};
console.table(results);
console.log(environment);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('./results/compile.json', import.meta.url),
  JSON.stringify({ environment, results }, null, 2) + '\n',
);

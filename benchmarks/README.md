# Benchmarks

```bash
pnpm build
```

```bash
pnpm benchmark
```

Both scripts write their results to `results/` with the environment they ran in.

## Method

**compile.bench.mjs** (Node, `--expose-gc`). For generated configs of 10, 100, 500 and 1,000
fields (`generateLargeConfig` in `@form-config/core/testing`: 80% text, 20% select, sections of ten
in two-column rows, every tenth field required, every fifth conditional), after five warm-up
compiles, 30 runs each of:

- compiling a new config object (so the cache never hits);
- compiling the same object again (cache hit);
- validating every field, and one field by name;
- one effect-tracker update.

**browser.bench.mjs** (Google Chrome via Playwright, the playground's `next build` production
output). For each size, five fresh page loads of `/large?fields=N`:

- **mount**: time from the page component starting to render to the form's first commit;
- **keystroke to frame**: 20 programmatic input events into one field, each timed until two
  animation frames later (so it includes React's commit and a paint, and is bounded below by the
  frame interval);
- **re-rendered fields**: how many text fields rendered during those keystrokes, from a counting
  wrapper around the built-in text field.

Medians are reported. Results vary with machine load; treat single numbers as indicative.

## Results

Apple M1, 8 cores, Node 22.23.2, Chrome 155, 2026-10-16.

| Fields | Compile (median) | Cached compile | Validate all | Validate one |
| -----: | ---------------: | -------------: | -----------: | -----------: |
|     10 |          0.17 ms |     < 0.001 ms |     0.013 ms |     0.003 ms |
|    100 |           1.2 ms |     < 0.001 ms |      0.13 ms |     0.013 ms |
|    500 |           3.2 ms |     < 0.001 ms |      0.29 ms |     0.036 ms |
|  1,000 |           6.8 ms |     < 0.001 ms |      0.37 ms |     0.062 ms |

| Fields | Mount (median of 5) | Keystroke to frame | Text fields re-rendered by typing |
| -----: | ------------------: | -----------------: | --------------------------------: |
|     10 |               15 ms |              28 ms |                                 1 |
|    100 |         34 to 38 ms |              28 ms |                                 1 |
|    500 |       159 to 299 ms |              24 ms |                                 1 |
|  1,000 |     526 to 1,142 ms |              20 ms |                                 1 |

Mount ranges are two runs of the benchmark; the 1,000-field mount varied by 2× between them.

What this shows:

- Typing costs the same at every size and re-renders only the edited field: subscriptions are
  field-level.
- Recompiling an unchanged config is free (cache), and single-field validation scales with the
  field, not the form.
- Mounting is linear in the number of fields and is the main cost for very large forms.
- Heap use per compile is reported in `results/compile.json` but varies with garbage-collection
  timing; it is not reliable enough to compare.

## Bundle size

Measured with esbuild (minified, production, ESM) from the packed packages in a clean project:

| Entry                                          | Minified |   Gzip |
| ---------------------------------------------- | -------: | -----: |
| `compileConfig` from `@form-config/core` alone |    49 kB |  16 kB |
| React + react-dom baseline                     |   218 kB |  67 kB |
| `SchemaForm` page (everything)                 |   576 kB | 188 kB |

Breakdown of the `SchemaForm` page (minified): React 217 kB, Base UI 196 kB, core 66 kB,
react-hook-form 41 kB, `@form-config/react` 32 kB, Floating UI 20 kB.

## Provisional budgets

From these baselines, on similar hardware: typing re-renders exactly one text field; compile of
1,000 fields under 15 ms; validation of one field under 0.5 ms; mount of 500 fields under 400 ms;
added gzip weight over React under 130 kB. They are not yet enforced in CI.

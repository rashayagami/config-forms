# Implementation plan

Status as of 2026-10-16. A box is ticked only when the work was run and verified; the evidence is
listed under each phase. Commands referred to are the root `pnpm` scripts unless stated.

## Phase 0: repository and tooling

- [x] pnpm workspace, Turborepo tasks, strict TypeScript, ESLint (with React Hooks rules), Prettier
- [x] Vitest in both packages; Playwright for the playground
- [x] `build`, `typecheck`, `lint`, `test`, `test:coverage`, `test:e2e`, `benchmark`, `dev` all run

Evidence: `pnpm build`, `typecheck`, `lint`, `test` all succeed from the root.

## Phase 1: configuration format and types

- [x] Versioned authoring format: flat components, layout grammar, pages, dependencies, actions,
      submission, theme reference
- [x] Machine-readable component and action catalogs, extensible
- [x] Structured errors with path, part, expectation and suggestion; unsupported versions rejected
- [x] `defineConfig` + `InferValues` for typed values

Evidence: `packages/core/test/compile.test.ts`, `ai.test.ts` (type-level test of `InferValues`).

## Phase 2: first vertical slice

- [x] JSON config → compiled → rendered form → typed values → validation → submit callback → reset

Evidence: `packages/react/test/single-page.test.tsx`.

## Phase 3: form engine (react-hook-form)

- [x] Resolver from the compiled config; field-level `useController`; `useWatch` limited to rule sources
- [x] Touched, dirty, reset and initial-value semantics; hidden and disabled field lifecycle
- [x] Page-scoped and whole-form validation
- [x] Render isolation: only the edited field and its dependents re-render
- [x] Independent forms from one config; Strict Mode

Evidence: `registry.test.tsx` (render isolation), `single-page.test.tsx` (two forms),
`benchmarks/results/browser.json` (1 re-rendered field per keystroke at every size).

## Phase 4: primitives

- [x] Text, textarea, number, date, checkbox, switch, radio, buttons (pending state) on Base UI
- [x] Labels, descriptions and errors linked through Base UI `Field`
- [ ] Separate documentation page per primitive (covered by the README tables only)

## Phase 5: composite components

- [x] Select, combobox, multiselect, checkbox group, repeater (field array)
- [ ] Tabs, dialog, drawer, table, file picker
- [ ] Registered option sources

## Phase 6: compilation and advanced rendering

- [x] Compile cache, normalized output, deterministic results
- [x] Conditions, dependency effects with precedence, cycle and self-dependency detection
- [x] Custom components and actions through the registries
- [x] Schema changes: a new config object starts a new form (documented)

Evidence: `compile.test.ts`, `runtime.test.ts`, `registry.test.tsx`.

## Phase 7: pages, submission and read-only views

- [x] Pages with progress, previous/next, back control, page validation, final validation
- [x] Conditional pages (page visibility), `go_to_page` action
- [x] `final` and `perStep` submission strategies with async failure handling and resubmission
- [x] `SchemaResponse` read-only view (server-renderable)

Evidence: `multi-page.test.tsx`; e2e "values survive resizing and moving between pages".

## Phase 8: styling, themes, responsive, accessibility

- [x] Token stylesheet with no literal colours (tested); default light and dark palettes
- [x] JSON themes: validation, fallbacks, dark colours, scoped overrides, runtime switching, `useTheme`
- [x] Container-query layout engine with configurable breakpoints and validated responsive props
- [x] No overflow at 320, 375, 768, 1024, 1440 and in a 300px sidebar (Chrome and Firefox)
- [x] Keyboard: tab order with visible focus, arrow keys in radio groups
- [ ] Visual design pass on the default look
- [ ] Automated axe run and a screen reader pass

Evidence: `theme.test.tsx`, `layout.test.ts`, `apps/playground/e2e/responsive.spec.ts` (45 tests),
`apps/playground/e2e/firefox-smoke.mjs`.

## Phase 9: performance

- [x] Reproducible compile/validate benchmark (Node) and render benchmark (Chrome, production build)
- [x] Bundle size measured (see benchmarks/README.md)
- [ ] Budgets enforced in CI
- [ ] Reduce mount cost of 1,000-field forms; consider lazy chunks for combobox/select

## Phase 10: packaging

- [x] ESM output with declarations, `exports` maps, `sideEffects`, CSS entry, peer dependencies
- [x] Packed tarballs installed into a clean npm project: imports, server rendering, blocked
      internal paths, declarations type-check under `nodenext`
- [ ] Release workflow (changesets) and publishing

## Next steps

1. Visual design pass on the default styling (audit first, then agreed changes).
2. Dialog and tabs components with `dialog.open` / `dialog.close`.
3. Registered option sources for the `options` effect.
4. axe checks in the Playwright suite.
5. CI running build, tests and the browser suite, with benchmark budgets.

# Decisions

Architectural decisions, newest last. Each records what was chosen, why, and what was given up.

## 1. Two packages, not seven

The brief sketched `core`, `primitives`, `components`, `form-engine`, `renderer`, `themes` and
`react`. Two packages keep the one boundary that matters, between code that needs React and code
that does not:

- `@form-config/core`: config types, catalog, compiler, conditions, validation, navigation and
  submission logic, themes, layout CSS, AI helpers. No React; usable on a server.
- `@form-config/react`: registry, renderer, built-in components, `ThemeProvider`.

Primitives, composites, renderer and themes are folders inside `@form-config/react`. Splitting them
into packages would add release and versioning work without letting anyone use one without the
others. Dependency direction is one way: react → core.

## 2. react-hook-form is the form state; no second engine

The first request asked for react-hook-form; a later brief described a custom
`useSyncExternalStore` engine. react-hook-form already provides field-level subscriptions
(`useController`, `useWatch`, `useFormState`), dirty and touched state, field arrays, reset and
focus management. Writing a second store would duplicate that and add risk. The library's own
logic plugs in where react-hook-form expects it:

- one **resolver** built from the compiled config (`createResolver`), so validation rules live in
  core and are testable without React;
- each field binds through its own `useController`, so typing re-renders that field only
  (measured: 1 field per keystroke at 10 to 1,000 fields);
- visibility, requirement and options subscribe with `useWatch` to exactly the fields their rules
  read (`CompiledForm.stateSources`);
- `set`/`clear` effects run in a `watch` callback outside rendering.

react-hook-form passes a resolver only the names of mounted fields. On a multi-page form that is
the current page, so page and whole-form validation set a **scope** through react-hook-form's
`context` option before calling `trigger` or `handleSubmit`.

## 3. Base UI for controls

Base UI (`@base-ui/react`) supplies unstyled, accessible controls (Field, Select, Combobox,
NumberField, Radio, Checkbox, Switch, Fieldset) and documents integration with react-hook-form.
Field components wrap Base UI parts, pass react-hook-form's `invalid`/`touched`/`dirty` to
`Field.Root`, and render errors with `Field.Error match`. Popups render into a container inside
the form's root, so they carry the form's theme.

## 4. Flat components placed by id

The first schema nested components inside each other. The AI-oriented brief asked for components
referenced by id from a separate layout. The format now has a flat `components` list and a
`layout` (or `pages`) grammar of ids and layout nodes:

- a component is defined once and placed once; the compiler reports duplicates and orphans;
- the component id is also its value key, so dependencies, initial values and submitted values all
  use the same name;
- consequence: values are flat (no nested objects); repeaters hold arrays of row objects.

## 5. Strict compiler, compact input, complete output

Unknown properties are errors, not ignored, so typos (`requird`) and invented props are caught.
Defaults are applied by the compiler, so configs state only what differs, and the normalized
output is complete and deterministic. Every issue has a code, a JSON Pointer, the part it belongs
to, the expectation and, where possible, a suggestion, including synonyms a model is likely to use
(`equals` → `eq`). Results are cached in a `WeakMap` per input object and catalog; compiled output
is frozen, so sharing it is safe.

## 6. Conditions are data, evaluated by a closed interpreter

Conditions use a fixed set of operators. Nothing is evaluated with `eval` or `new Function`, and
regular expressions come only from `pattern`, length-limited and syntax-checked at compile time.

## 7. Dependency semantics

- State effects (`show`, `require`, ...) hold while their condition does. Value effects (`set`,
  `clear`) fire on a false → true transition after a user change, never on load or reset, so
  initial values stay authoritative.
- Precedence is fixed (hide > show, disable > enable, optional > require, first `options` wins,
  later `set` wins) and contradictions produce a warning, not an error.
- Cycles of value effects, self-hiding and hiding one's own source's container are errors.
- Hidden values are kept in state, not validated, and omitted from submissions by default. They
  are cleared only by an explicit `clear` effect.
- Branching between pages is page visibility (`show`/`hide` on a page id). A "navigate" effect
  fired by a value change would move the user while they type, so it is not offered; explicit
  jumps are the `navigation.go_to_page` action.

## 8. Submission strategy is one form-level setting

`submission.strategy` (`final` or `perStep`) is authoritative. Page `submission` entries are only
valid under `perStep`, and `perStep`-only settings are rejected under `final`. Under `perStep`, the
final page's submission validates the whole form. Submitted pages are fingerprinted, so Next asks
for a resubmission when a submitted page changed. Handlers are names resolved to application
functions; the library never makes a network request.

## 9. Themes are CSS custom properties, scoped to an element

A validated JSON theme becomes `--fc-*` variables in a `<style>` scoped to the provider's or form's
own element (`[data-fc-theme]`). Optional tokens derive from required ones with `color-mix()`, so a
four-colour theme is complete. Colour values are restricted to safe syntax because they end up in
CSS text. Built-in styles reference only tokens (a test fails on any literal colour), so swapping a
theme restyles everything without remounting. No runtime styling engine.

## 10. Responsive layout uses container queries

Layouts respond to the width of the form's container (`container: fc / inline-size`), not the
viewport, so the same form behaves correctly in a page, a sidebar or a dialog. Breakpoint rules
come from one function, `layoutCss()`: it generates the default stylesheet at build time and
scoped rules for custom breakpoints at runtime, so there is a single source. Responsive props are
resolved to complete per-breakpoint values by the compiler and rendered as data attributes and
custom properties: deterministic markup, no resize listeners, no re-render on resize.

## 11. Versions and package manager

Dependencies are pinned exactly. The workspace uses pnpm 11 (the version installed on the
development machine; Turborepo invokes whatever `pnpm` is on the PATH). pnpm 11's minimum release
age policy rejected versions published in the previous day; the pins were moved to the newest
releases at least a week old instead of relaxing the policy. TypeScript is 6.0.3 because
typescript-eslint supports only TypeScript below 6.1.

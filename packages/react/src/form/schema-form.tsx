'use client';
import {
  ConfigError,
  compileConfig,
  createEffectTracker,
  isSelfVisible,
  nextPage,
  prepareSubmission,
  previousPage,
  submissionForPage,
  visiblePages,
  type BreakpointConfig,
  type CompiledForm,
  type CustomValidator,
  type FormValues,
  type MessageKey,
} from '@form-config/core';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { defaultRegistry } from '../default-registry.js';
import type { ComponentRegistry } from '../registry.js';
import { ScopedTheme, type ThemeSelection } from '../theme/theme-provider.js';
import { defaultActionRegistry, type ActionRegistry, type FormController } from './actions.js';
import { RuntimeContext, type RuntimeContextValue } from './context.js';
import { Footer, Progress } from './navigation.js';
import { LayoutItems } from './renderer.js';
import { createResolver, type ResolverOptions, type ValidationScope } from './resolver.js';
import { createStore, initialSubmissionState, type SubmissionState } from './store.js';

export interface SubmitContext {
  readonly formId: string;
  /** `final` for the whole form, `step` for one page under perStep submission. */
  readonly kind: 'final' | 'step';
  /** The submitting page, or null for a single-page form. */
  readonly pageId: string | null;
  /** Every visible value so far, whatever the handler's payload. */
  readonly allValues: FormValues;
}

/**
 * Application code that receives validated values. It may be async; a thrown
 * error (or rejected promise) marks the submission failed and its message is
 * shown on the form. Nothing is sent anywhere by the library itself.
 */
export type SubmitHandler = (values: FormValues, context: SubmitContext) => void | Promise<void>;

export interface SchemaFormProps {
  /** The authoring configuration (an object or a JSON string). A new object starts a new form. */
  readonly config: unknown;
  readonly registry?: ComponentRegistry;
  readonly actions?: ActionRegistry;
  /** Validators named by `validator` props. */
  readonly validators?: Readonly<Record<string, CustomValidator>>;
  /** Submit handlers named by `submission.handler` and page submissions. */
  readonly handlers?: Readonly<Record<string, SubmitHandler>>;
  /** Receives the final submission when the config names no handler. */
  readonly onSubmit?: SubmitHandler;
  /** Called after every value change, without re-rendering the form. */
  readonly onValuesChange?: (values: FormValues, changedPath: string | undefined) => void;
  readonly onPageChange?: (pageId: string) => void;
  readonly onSubmissionChange?: (state: SubmissionState) => void;
  readonly messages?: Partial<Record<MessageKey | 'checked', string>>;
  /** A theme for this form only, or the name of a theme registered with a ThemeProvider. Overrides `config.theme`. */
  readonly theme?: ThemeSelection;
  readonly colorScheme?: 'light' | 'dark' | 'system';
  /** Custom breakpoints for this form only; otherwise the ThemeProvider's, or the defaults. */
  readonly breakpoints?: BreakpointConfig;
  readonly className?: string;
}

const formKeys = new WeakMap<CompiledForm, number>();
let nextKey = 0;
function keyFor(form: CompiledForm): number {
  let key = formKeys.get(form);
  if (key === undefined) {
    key = nextKey += 1;
    formKeys.set(form, key);
  }
  return key;
}

function referencedNames(form: CompiledForm): { validators: string[]; handlers: string[] } {
  const validators = new Set<string>();
  for (const component of form.config.components) {
    const name = component.props['validator'];
    if (typeof name === 'string') validators.add(name);
  }
  const handlers = new Set<string>();
  if (form.config.submission.handler) handlers.add(form.config.submission.handler);
  for (const page of form.config.pages) if (page.submission) handlers.add(page.submission.handler);
  return { validators: [...validators], handlers: [...handlers] };
}

/**
 * Renders a configuration as a form. Values live in react-hook-form while the
 * form is mounted; nothing is persisted. Throws a `ConfigError` for an invalid
 * config, and an Error when it names a validator, handler or action that was
 * not supplied, so mistakes surface during development.
 */
export function SchemaForm(props: SchemaFormProps) {
  const registry = props.registry ?? defaultRegistry;
  const actions = props.actions ?? defaultActionRegistry;
  const result = compileConfig(props.config, {
    catalog: registry.catalog,
    actions: actions.catalog,
  });
  if (!result.ok) throw new ConfigError([...result.errors, ...result.warnings]);
  const { form } = result;

  const needed = referencedNames(form);
  const missingValidators = needed.validators.filter((name) => !props.validators?.[name]);
  const missingHandlers = needed.handlers.filter((name) => !props.handlers?.[name]);
  const finalNeedsOnSubmit =
    form.config.submission.handler === null && !props.onSubmit && finalFallsBackToOnSubmit(form);
  if (missingValidators.length || missingHandlers.length || finalNeedsOnSubmit) {
    throw new Error(
      [
        missingValidators.length ? `validators not supplied: ${missingValidators.join(', ')}` : '',
        missingHandlers.length ? `submit handlers not supplied: ${missingHandlers.join(', ')}` : '',
        finalNeedsOnSubmit
          ? 'the config names no final submit handler, so <SchemaForm> needs onSubmit'
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
  }
  for (const component of form.config.components) {
    for (const call of Object.values(component.on)) {
      if (!actions.handler(call.action))
        throw new Error(`Action "${call.action}" has no handler in the action registry`);
    }
  }

  return (
    <FormInstance key={keyFor(form)} {...props} form={form} registry={registry} actions={actions} />
  );
}

/** Whether some page can end a submission without a handler of its own. */
function finalFallsBackToOnSubmit(form: CompiledForm): boolean {
  if (form.config.submission.strategy === 'final') return true;
  const last = form.config.pages[form.config.pages.length - 1];
  if (!last?.submission) return true;
  // A hidden last page makes an earlier page the last one.
  return (
    form.config.pages.some((page) => !page.submission) &&
    form.config.dependencies.some((d) => d.targets.includes(last.id))
  );
}

interface InstanceProps extends SchemaFormProps {
  readonly form: CompiledForm;
  readonly registry: ComponentRegistry;
  readonly actions: ActionRegistry;
}

function fingerprint(values: unknown): string {
  return JSON.stringify(values, (_key, value: unknown) =>
    typeof Blob !== 'undefined' && value instanceof Blob ? `[file ${value.size}]` : value,
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong. Try again.';
}

function FormInstance(props: InstanceProps) {
  const { form, registry, actions } = props;
  const latest = useRef(props);
  const resolverOptions = useRef<ResolverOptions>({
    validators: props.validators ?? {},
    messages: props.messages,
  });
  useEffect(() => {
    latest.current = props;
    resolverOptions.current = { validators: props.validators ?? {}, messages: props.messages };
  });

  const scope = useRef<ValidationScope>({ current: null, last: null }).current;
  const resolver = useMemo(() => createResolver(form, resolverOptions), [form]);
  const [defaultValues] = useState(() => form.getInitialValues());
  const methods = useForm<FormValues, ValidationScope, FieldValues>({
    defaultValues,
    resolver,
    context: scope,
    mode:
      form.config.validateOn === 'blur'
        ? 'onBlur'
        : form.config.validateOn === 'change'
          ? 'onChange'
          : 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: true,
    shouldUnregister: false,
  });
  const { control, getValues, setValue, trigger, handleSubmit, reset, setFocus } = methods;

  const firstPage = form.pageOrder[0] as string;
  const [page, setPage] = useState(firstPage);
  const pageRef = useRef(page);
  const pendingFocus = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const stores = useMemo(
    () => ({
      submission: createStore<SubmissionState>(initialSubmissionState),
      pending: createStore<string | null>(null),
    }),
    [],
  );

  const changePage = (id: string, focusPath?: string) => {
    pageRef.current = id;
    pendingFocus.current = focusPath ?? null;
    setPage(id);
  };

  useEffect(() => {
    latest.current.onPageChange?.(page);
    if (pendingFocus.current) {
      const path = pendingFocus.current;
      pendingFocus.current = null;
      setFocus(path);
    } else if (form.config.mode === 'pages' && page !== firstPage) {
      headingRef.current?.focus();
    }
    // Focus moves only when the page changes.
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      stores.submission.subscribe(() =>
        latest.current.onSubmissionChange?.(stores.submission.get()),
      ),
    [stores],
  );

  // Value effects (set / clear) and the values callback, outside rendering.
  useEffect(() => {
    const tracker = createEffectTracker(form);
    tracker.prime(getValues());
    let depth = 0;
    const subscription = methods.watch((values, { name }) => {
      latest.current.onValuesChange?.(getValues(), name);
      if (form.valueRules.length === 0) return;
      if (name === undefined) {
        tracker.prime(getValues());
        return;
      }
      if (depth > 16) {
        console.error('form-config: value effects did not settle; stopping to avoid a loop');
        return;
      }
      const writes = tracker.update(values as FormValues, name);
      depth += 1;
      try {
        for (const write of writes) {
          setValue(write.path, write.value, {
            shouldDirty: true,
            shouldValidate: methods.formState.isSubmitted,
          });
        }
      } finally {
        depth -= 1;
      }
    });
    return () => subscription.unsubscribe();
  }, [form, methods, getValues, setValue]);

  /** The page of the first error in layout order, and its path. */
  const firstError = (): { page: string; path: string } | null => {
    const path = Object.keys(scope.last?.errors ?? {})[0];
    if (!path) return null;
    const id = path.split('.')[0] as string;
    return { page: form.components.get(id)?.page ?? pageRef.current, path };
  };

  const focusFirstError = () => {
    const error = firstError();
    if (!error) return;
    if (error.page !== pageRef.current) changePage(error.page, error.path);
    else setFocus(error.path);
  };

  const validateScope = async (current: ValidationScope['current']): Promise<boolean> => {
    scope.current = current;
    try {
      return await trigger();
    } finally {
      scope.current = null;
    }
  };

  const runHandler = async (
    kind: 'final' | 'step',
    pageId: string | null,
    run: (values: FormValues) => Promise<void>,
    current: ValidationScope['current'],
  ) => {
    if (stores.submission.get().status === 'submitting') return;
    scope.current = current;
    const store = stores.submission;
    try {
      await handleSubmit(
        async (values) => {
          scope.current = null;
          store.set((s) => ({ ...s, status: 'submitting', kind, pageId, error: null }));
          await run(values as FormValues);
          store.set((s) => ({ ...s, status: 'succeeded', kind, pageId, error: null }));
        },
        () => {
          scope.current = null;
          store.set((s) => ({ ...s, status: 'idle', kind, pageId, error: null }));
          const error = firstError();
          if (error && error.page !== pageRef.current) changePage(error.page, error.path);
        },
      )();
    } catch (error) {
      store.set((s) => ({ ...s, status: 'failed', kind, pageId, error: errorMessage(error) }));
    } finally {
      scope.current = null;
    }
  };

  const allVisibleValues = () => prepareSubmission(form, getValues());

  const submitFinal = (handlerName: string | null) =>
    runHandler(
      'final',
      form.config.mode === 'pages' ? pageRef.current : null,
      async () => {
        const values = prepareSubmission(form, getValues());
        const handler = handlerName
          ? latest.current.handlers?.[handlerName]
          : latest.current.onSubmit;
        if (!handler) throw new Error(`No submit handler "${handlerName ?? 'onSubmit'}"`);
        await handler(values, {
          formId: form.config.id,
          kind: 'final',
          pageId: form.config.mode === 'pages' ? pageRef.current : null,
          allValues: values,
        });
      },
      { all: true },
    );

  const submitStep = (
    pageId: string,
    handlerName: string,
    payload: 'page' | 'all',
    isLast: boolean,
  ) =>
    runHandler(
      isLast ? 'final' : 'step',
      pageId,
      async () => {
        const values = prepareSubmission(
          form,
          getValues(),
          payload === 'page' ? { pages: [pageId] } : {},
        );
        const handler = latest.current.handlers?.[handlerName];
        if (!handler) throw new Error(`No submit handler "${handlerName}"`);
        await handler(values, {
          formId: form.config.id,
          kind: isLast ? 'final' : 'step',
          pageId,
          allValues: allVisibleValues(),
        });
        const sent = fingerprint(prepareSubmission(form, getValues(), { pages: [pageId] }));
        stores.submission.set((s) => ({
          ...s,
          submittedPages: { ...s.submittedPages, [pageId]: sent },
        }));
        if (!isLast && form.config.submission.advanceOnSuccess) {
          const target = nextPage(form, getValues(), pageId);
          if (target) changePage(target);
        }
      },
      // A final page under perStep validates the whole form before its handler runs.
      isLast ? { all: true } : { pages: [pageId] },
    );

  /** Whether a perStep page still has to be (re)submitted before moving past it. */
  const needsStepSubmission = (pageId: string): boolean => {
    const { strategy, requireStepSubmission } = form.config.submission;
    if (strategy !== 'perStep' || !requireStepSubmission || !form.page(pageId)?.submission)
      return false;
    const sent = stores.submission.get().submittedPages[pageId];
    return (
      sent === undefined ||
      sent !== fingerprint(prepareSubmission(form, getValues(), { pages: [pageId] }))
    );
  };

  const submitCurrent = async () => {
    const current = pageRef.current;
    const submission = submissionForPage(form, getValues(), current);
    if (submission === null) {
      await controller.next();
      return;
    }
    if (submission.kind === 'final') await submitFinal(submission.handler);
    else await submitStep(current, submission.handler, submission.payload, submission.isLast);
  };

  const controller: FormController = {
    formId: form.config.id,
    currentPage: () => pageRef.current,
    getValues: () => getValues(),
    setValue: (path, value) =>
      setValue(path, value, { shouldDirty: true, shouldValidate: methods.formState.isSubmitted }),
    validate: async () => {
      const ok = await validateScope({ all: true });
      if (!ok) focusFirstError();
      return ok;
    },
    submit: submitCurrent,
    reset: () => {
      reset(form.getInitialValues());
      stores.submission.set(initialSubmissionState);
      if (pageRef.current !== firstPage) changePage(firstPage);
    },
    next: async () => {
      const current = pageRef.current;
      const target = nextPage(form, getValues(), current);
      if (!target) return false;
      if (needsStepSubmission(current)) {
        const submission = submissionForPage(form, getValues(), current);
        if (submission?.kind === 'step')
          await submitStep(current, submission.handler, submission.payload, submission.isLast);
        return pageRef.current !== current;
      }
      if (form.config.navigation.validateOnNext && !(await validateScope({ pages: [current] }))) {
        focusFirstError();
        return false;
      }
      changePage(target);
      return true;
    },
    previous: () => {
      if (!form.config.navigation.allowBack) return false;
      const target = previousPage(form, getValues(), pageRef.current);
      if (!target) return false;
      changePage(target);
      return true;
    },
    goToPage: async (target) => {
      const values = getValues();
      if (!form.page(target) || !isSelfVisible(form, target, values)) {
        console.warn(`form-config: page "${target}" is hidden or does not exist`);
        return false;
      }
      const order = visiblePages(form, values);
      const from = order.indexOf(pageRef.current);
      const to = order.indexOf(target);
      if (to <= from) {
        if (to < from && !form.config.navigation.allowBack) return false;
        changePage(target);
        return true;
      }
      // Moving forward checks every page passed over, as Next would.
      for (const pageId of order.slice(from, to)) {
        if (needsStepSubmission(pageId)) {
          if (pageId !== pageRef.current) changePage(pageId);
          return false;
        }
        if (form.config.navigation.validateOnNext && !(await validateScope({ pages: [pageId] }))) {
          focusFirstError();
          return false;
        }
      }
      changePage(target);
      return true;
    },
  };
  const controllerRef = useRef(controller);
  useEffect(() => {
    controllerRef.current = controller;
  });

  const runtime = useMemo<RuntimeContextValue>(
    () => ({
      form,
      registry,
      control,
      getValues,
      submission: stores.submission,
      pending: stores.pending,
      emit: (componentId, event) => {
        const call = form.components.get(componentId)?.on[event];
        if (!call) return;
        const handler = actions.handler(call.action);
        if (!handler) throw new Error(`Action "${call.action}" has no handler`);
        stores.pending.set(componentId);
        Promise.resolve(
          handler({ componentId, event, args: call.args, form: controllerRef.current }),
        )
          .catch((error: unknown) =>
            console.error(`form-config: action "${call.action}" failed`, error),
          )
          .finally(() => {
            if (stores.pending.get() === componentId) stores.pending.set(null);
          });
      },
    }),
    [form, registry, actions, control, getValues, stores],
  );

  const pageConfig = form.page(page);
  // The same element on every render of this component, so a re-render of the host (new
  // callbacks, a theme switch) stops here instead of re-rendering every field.
  const content = useMemo(
    () => (
      <div className="fc-stack fc-page" key={page}>
        <LayoutItems items={pageConfig?.layout ?? []} rowPrefix="" />
      </div>
    ),
    [page, pageConfig],
  );
  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void controllerRef.current.submit();
  };
  const formTheme = props.theme ?? form.config.theme ?? undefined;

  return (
    <RuntimeContext.Provider value={runtime}>
      <ScopedTheme
        theme={formTheme}
        colorScheme={props.colorScheme}
        breakpoints={props.breakpoints}
      >
        <form
          className={props.className ? `fc-form ${props.className}` : 'fc-form'}
          noValidate
          onSubmit={onFormSubmit}
          aria-labelledby={form.config.title ? titleId : undefined}
          data-form-id={form.config.id}
        >
          {form.config.title ? (
            <h2 id={titleId} className="fc-title">
              {form.config.title}
            </h2>
          ) : null}
          {form.config.description ? (
            <p className="fc-description">{form.config.description}</p>
          ) : null}
          <Progress current={page} />
          {form.config.mode === 'pages' && pageConfig?.title ? (
            <h3 ref={headingRef} tabIndex={-1} className="fc-page-title">
              {pageConfig.title}
            </h3>
          ) : null}
          {pageConfig?.description ? (
            <p className="fc-description">{pageConfig.description}</p>
          ) : null}
          {content}
          <Footer
            current={page}
            onPrevious={() => controllerRef.current.previous()}
            onNext={() => void controllerRef.current.next()}
            onReset={() => controllerRef.current.reset()}
          />
        </form>
      </ScopedTheme>
    </RuntimeContext.Provider>
  );
}

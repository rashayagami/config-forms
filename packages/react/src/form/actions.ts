import {
  builtInActions,
  createActionCatalog,
  type ActionCatalog,
  type ActionSpec,
  type FormValues,
  type JsonObject,
} from '@form-config/core';

/** What an action handler can do to the form it runs in. */
export interface FormController {
  readonly formId: string;
  /** The page being shown ("#main" for a single-page form). */
  currentPage(): string;
  getValues(): FormValues;
  setValue(path: string, value: unknown): void;
  /** Validates every visible field; resolves true when valid. */
  validate(): Promise<boolean>;
  /** Runs the configured submission for the current page (final or per-step). */
  submit(): Promise<void>;
  reset(): void;
  next(): Promise<boolean>;
  previous(): boolean;
  goToPage(pageId: string): Promise<boolean>;
}

export interface ActionContext {
  readonly componentId: string;
  readonly event: string;
  readonly args: JsonObject;
  readonly form: FormController;
}

/** Trusted TypeScript run for an action id. Configurations only name it. */
export type ActionHandler = (context: ActionContext) => void | Promise<void>;

export interface ActionDefinition {
  readonly spec: ActionSpec;
  readonly run: ActionHandler;
}

export interface ActionRegistry {
  readonly catalog: ActionCatalog;
  handler(id: string): ActionHandler | undefined;
  extend(
    definitions: readonly ActionDefinition[],
    options?: { readonly override?: boolean },
  ): ActionRegistry;
}

export function createActionRegistry(definitions: readonly ActionDefinition[]): ActionRegistry {
  const catalog = createActionCatalog(definitions.map((definition) => definition.spec));
  const handlers = new Map(definitions.map((definition) => [definition.spec.id, definition.run]));
  const registry: ActionRegistry = {
    catalog,
    handler: (id) => handlers.get(id),
    extend: (more, options) => {
      const merged = new Map(definitions.map((definition) => [definition.spec.id, definition]));
      for (const definition of more) {
        if (merged.has(definition.spec.id) && !options?.override) {
          throw new Error(
            `Action "${definition.spec.id}" is already registered; pass { override: true } to replace it`,
          );
        }
        merged.set(definition.spec.id, definition);
      }
      return createActionRegistry([...merged.values()]);
    },
  };
  return Object.freeze(registry);
}

const runners: Record<string, ActionHandler> = {
  'form.validate': async ({ form }) => {
    await form.validate();
  },
  'form.validate_and_submit': ({ form }) => form.submit(),
  'form.reset': ({ form }) => form.reset(),
  'navigation.next': async ({ form }) => {
    await form.next();
  },
  'navigation.previous': ({ form }) => {
    form.previous();
  },
  'navigation.go_to_page': async ({ form, args }) => {
    await form.goToPage(String(args['page']));
  },
};

export const builtInActionDefinitions: readonly ActionDefinition[] = builtInActions.map((spec) => {
  const run = runners[spec.id];
  if (!run) throw new Error(`No runner for built-in action "${spec.id}"`);
  return { spec, run };
});

export const defaultActionRegistry: ActionRegistry = createActionRegistry(builtInActionDefinitions);

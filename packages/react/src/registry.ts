import {
  createCatalog,
  type Catalog,
  type ComponentSpec,
  type JsonValue,
  type Option,
} from '@form-config/core';
import type { ComponentType, ReactNode, Ref } from 'react';

/** Props of a form field component. The renderer binds it to react-hook-form; the component never owns its value. */
export interface FieldComponentProps<P = Readonly<Record<string, JsonValue>>> {
  /** The component id from the config. */
  readonly id: string;
  /** The value path in the form, e.g. "email" or "travellers.0.name". Unique per rendered field. */
  readonly name: string;
  /** The component's normalized props (config values plus catalog defaults). */
  readonly props: P;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onBlur: () => void;
  /** Attach to the focusable element so validation can focus it. */
  readonly inputRef: Ref<HTMLElement>;
  readonly error: string | undefined;
  readonly invalid: boolean;
  readonly touched: boolean;
  readonly dirty: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  /** Effective options for choice components (dependency rules may replace them). */
  readonly options: readonly Option[] | undefined;
}

/** Props of a display component: content only. */
export interface DisplayComponentProps<P = Readonly<Record<string, JsonValue>>> {
  readonly id: string;
  readonly props: P;
}

/** Props of a control that raises events (a button). */
export interface ControlComponentProps<P = Readonly<Record<string, JsonValue>>> {
  readonly id: string;
  readonly props: P;
  readonly disabled: boolean;
  /** True while the action it started is running. */
  readonly pending: boolean;
  /** Raise one of the component's declared events; the renderer runs the configured action. */
  readonly emit: (event: string) => void;
}

export interface RepeaterRow {
  /** Stable React key for the row. */
  readonly key: string;
  readonly index: number;
  /** "<itemLabel> <n>". */
  readonly title: string;
  readonly content: ReactNode;
  readonly remove: () => void;
  readonly canRemove: boolean;
}

export interface RepeaterComponentProps<P = Readonly<Record<string, JsonValue>>> {
  readonly id: string;
  readonly name: string;
  readonly props: P;
  readonly rows: readonly RepeaterRow[];
  readonly add: () => void;
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly error: string | undefined;
}

export type ComponentDefinition =
  | {
      readonly spec: ComponentSpec & { readonly kind: 'field' };
      readonly component: ComponentType<FieldComponentProps>;
    }
  | {
      readonly spec: ComponentSpec & { readonly kind: 'display' };
      readonly component: ComponentType<DisplayComponentProps>;
    }
  | {
      readonly spec: ComponentSpec & { readonly kind: 'control' };
      readonly component: ComponentType<ControlComponentProps>;
    }
  | {
      readonly spec: ComponentSpec & { readonly kind: 'repeater' };
      readonly component: ComponentType<RepeaterComponentProps>;
    };

/**
 * Maps component types to their spec and React implementation. The catalog
 * the compiler validates against is derived from the same definitions, so a
 * config can only name components the registry can render.
 *
 * Create registries once, at module scope: a new registry object makes every
 * form using it recompile its config.
 */
export interface ComponentRegistry {
  readonly catalog: Catalog;
  get(type: string): ComponentDefinition | undefined;
  /**
   * A new registry with these definitions added. Registering an existing type
   * throws unless `override` is true (to replace a built-in's look).
   */
  extend(
    definitions: readonly ComponentDefinition[],
    options?: { readonly override?: boolean },
  ): ComponentRegistry;
}

export function createRegistry(definitions: readonly ComponentDefinition[]): ComponentRegistry {
  const byType = new Map<string, ComponentDefinition>();
  for (const definition of definitions) {
    if (byType.has(definition.spec.type))
      throw new Error(`Component type "${definition.spec.type}" is registered twice`);
    byType.set(definition.spec.type, definition);
  }
  const catalog = createCatalog(definitions.map((definition) => definition.spec));
  const registry: ComponentRegistry = {
    catalog,
    get: (type) => byType.get(type),
    extend: (more, options) => {
      const merged = new Map(byType);
      for (const definition of more) {
        if (merged.has(definition.spec.type) && !options?.override) {
          throw new Error(
            `Component type "${definition.spec.type}" is already registered; pass { override: true } to replace it`,
          );
        }
        merged.set(definition.spec.type, definition);
      }
      return createRegistry([...merged.values()]);
    },
  };
  return Object.freeze(registry);
}

/** Replaces the React component of a built-in type while keeping its spec. */
export function withComponent<D extends ComponentDefinition>(
  definition: D,
  component: D['component'],
): D {
  return { ...definition, component };
}

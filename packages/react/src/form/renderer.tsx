'use client';
import { gapVars, type NormalizedLayoutItem, type NormalizedLayoutNode } from '@form-config/core';
import { useId, type ComponentType, type CSSProperties } from 'react';
import {
  useController,
  useFieldArray,
  useFormState,
  type Control,
  type FieldError,
  type FieldValues,
} from 'react-hook-form';
import type {
  ComponentDefinition,
  ControlComponentProps,
  DisplayComponentProps,
  FieldComponentProps,
  RepeaterComponentProps,
} from '../registry.js';
import { useComponentState, useRuntime, useVisible } from './context.js';
import { useStore } from './store.js';

/** Renders layout items: component ids and layout nodes. `rowPrefix` is set inside a repeater row. */
export function LayoutItems({
  items,
  rowPrefix,
}: {
  readonly items: readonly NormalizedLayoutItem[];
  readonly rowPrefix: string;
}) {
  return items.map((item) =>
    item.kind === 'component' ? (
      <ComponentView key={item.id} id={item.id} rowPrefix={rowPrefix} />
    ) : (
      <LayoutNodeView key={item.id} node={item} rowPrefix={rowPrefix} />
    ),
  );
}

/**
 * Attributes that carry a node's resolved responsive layout. The values are
 * fixed per config, so server and client render the same markup, and only CSS
 * container queries react to the available width.
 */
function layoutAttributes(node: NormalizedLayoutNode) {
  const style: Record<string, string | number> = gapVars(node.gap);
  if (node.columns) {
    style['--fc-cols-mobile'] = node.columns.mobile;
    style['--fc-cols-tablet'] = node.columns.tablet;
    style['--fc-cols-desktop'] = node.columns.desktop;
  }
  if (node.span) {
    style['--fc-span-mobile'] = node.span.mobile;
    style['--fc-span-tablet'] = node.span.tablet;
    style['--fc-span-desktop'] = node.span.desktop;
  }
  return {
    style: style as CSSProperties,
    'data-gap': '',
    'data-span': node.span ? '' : undefined,
    'data-stack-below': node.stackBelow,
    'data-align': node.align,
    'data-justify': node.justify,
    'data-max-width': node.maxWidth === 'full' ? undefined : node.maxWidth,
    'data-hide-mobile': node.visibleOn.includes('mobile') ? undefined : '',
    'data-hide-tablet': node.visibleOn.includes('tablet') ? undefined : '',
    'data-hide-desktop': node.visibleOn.includes('desktop') ? undefined : '',
  };
}

function LayoutNodeView({
  node,
  rowPrefix,
}: {
  readonly node: NormalizedLayoutNode;
  readonly rowPrefix: string;
}) {
  const visible = useVisible(node.id, rowPrefix);
  const headingId = useId();
  if (!visible) return null;
  const children = <LayoutItems items={node.children} rowPrefix={rowPrefix} />;
  const attributes = layoutAttributes(node);
  switch (node.type) {
    case 'section':
      return (
        <section
          className="fc-section"
          aria-labelledby={node.title ? headingId : undefined}
          {...attributes}
        >
          {node.title ? (
            <h3 id={headingId} className="fc-section-title">
              {node.title}
            </h3>
          ) : null}
          {node.description ? <p className="fc-description">{node.description}</p> : null}
          <div className="fc-stack" data-gap="" style={attributes.style}>
            {children}
          </div>
        </section>
      );
    case 'group':
      return (
        <fieldset className="fc-group" {...attributes}>
          {node.title ? <legend className="fc-group-title">{node.title}</legend> : null}
          {node.description ? <p className="fc-description">{node.description}</p> : null}
          <div className="fc-stack" data-gap="" style={attributes.style}>
            {children}
          </div>
        </fieldset>
      );
    case 'row':
      return (
        <div className="fc-row" {...attributes}>
          {children}
        </div>
      );
    case 'grid':
      return (
        <div className="fc-grid" {...attributes}>
          {children}
        </div>
      );
    case 'column':
      return (
        <div className="fc-stack" {...attributes}>
          {children}
        </div>
      );
  }
}

function ComponentView({ id, rowPrefix }: { readonly id: string; readonly rowPrefix: string }) {
  const { form, registry } = useRuntime();
  const component = form.components.get(id);
  const definition = component ? registry.get(component.type) : undefined;
  if (!component || !definition) {
    // The compiler checks every type against this registry's catalog, so this is unreachable for a compiled config.
    throw new Error(`No component registered for "${component?.type ?? id}"`);
  }
  return <ComponentGate definition={definition} id={id} rowPrefix={rowPrefix} />;
}

function ComponentGate({
  definition,
  id,
  rowPrefix,
}: {
  readonly definition: ComponentDefinition;
  readonly id: string;
  readonly rowPrefix: string;
}) {
  const state = useComponentState(id, rowPrefix);
  if (!state.visible) return null;
  switch (definition.spec.kind) {
    case 'field':
      return (
        <FieldBinding
          component={definition.component as ComponentType<FieldComponentProps>}
          id={id}
          rowPrefix={rowPrefix}
          disabled={state.disabled}
          readOnly={state.readOnly}
          required={state.required}
          options={state.options}
        />
      );
    case 'repeater':
      return (
        <RepeaterBinding
          component={definition.component as ComponentType<RepeaterComponentProps>}
          id={id}
          disabled={state.disabled}
          required={state.required}
        />
      );
    case 'control':
      return (
        <ControlBinding
          component={definition.component as ComponentType<ControlComponentProps>}
          id={id}
          disabled={state.disabled}
        />
      );
    case 'display':
      return (
        <DisplayBinding
          component={definition.component as ComponentType<DisplayComponentProps>}
          id={id}
        />
      );
  }
}

interface FieldBindingProps {
  readonly component: ComponentType<FieldComponentProps>;
  readonly id: string;
  readonly rowPrefix: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly options: FieldComponentProps['options'];
}

/** Binds one field to react-hook-form. It subscribes to its own value and state only. */
function FieldBinding({
  component: Component,
  id,
  rowPrefix,
  disabled,
  readOnly,
  required,
  options,
}: FieldBindingProps) {
  const { form, control, emit } = useRuntime();
  const component = form.components.get(id);
  const name = form.pathOf(id, rowPrefix);
  const { field, fieldState } = useController({ control, name });
  const hasChangeAction = component?.on['change'] !== undefined;
  const hasBlurAction = component?.on['blur'] !== undefined;
  return (
    <Component
      id={id}
      name={name}
      props={component?.props ?? {}}
      value={field.value}
      onChange={(value) => {
        field.onChange(value);
        if (hasChangeAction) emit(id, 'change');
      }}
      onBlur={() => {
        field.onBlur();
        if (hasBlurAction) emit(id, 'blur');
      }}
      inputRef={field.ref}
      error={fieldState.error?.message}
      invalid={fieldState.invalid}
      touched={fieldState.isTouched}
      dirty={fieldState.isDirty}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      options={options}
    />
  );
}

function RepeaterBinding({
  component: Component,
  id,
  disabled,
  required,
}: {
  readonly component: ComponentType<RepeaterComponentProps>;
  readonly id: string;
  readonly disabled: boolean;
  readonly required: boolean;
}) {
  const { form, control } = useRuntime();
  const component = form.components.get(id);
  const props = component?.props ?? {};
  // FormValues is an open record, so react-hook-form cannot type array paths; rows are plain objects.
  const { fields, append, remove } = useFieldArray<FieldValues>({
    control: control as unknown as Control<FieldValues>,
    name: id,
  });
  const { errors } = useFormState({ control, name: id });
  const rootError = (errors[id] as { root?: FieldError } | undefined)?.root?.message;
  const min = typeof props['minItems'] === 'number' ? props['minItems'] : 0;
  const max = typeof props['maxItems'] === 'number' ? props['maxItems'] : Infinity;
  const itemLabel = typeof props['itemLabel'] === 'string' ? props['itemLabel'] : 'Item';
  const layout = component?.layout ?? [];
  return (
    <Component
      id={id}
      name={id}
      props={props}
      disabled={disabled}
      required={required}
      error={rootError}
      canAdd={!disabled && fields.length < max}
      add={() => append(form.createRow(id), { shouldFocus: true })}
      rows={fields.map((row, index) => ({
        key: row.id,
        index,
        title: `${itemLabel} ${index + 1}`,
        content: (
          <div className="fc-stack">
            <LayoutItems items={layout} rowPrefix={`${id}.${index}.`} />
          </div>
        ),
        remove: () => remove(index),
        canRemove: !disabled && fields.length > min,
      }))}
    />
  );
}

function ControlBinding({
  component: Component,
  id,
  disabled,
}: {
  readonly component: ComponentType<ControlComponentProps>;
  readonly id: string;
  readonly disabled: boolean;
}) {
  const { form, emit, pending } = useRuntime();
  const isPending = useStore(pending, (running) => running === id);
  return (
    <Component
      id={id}
      props={form.components.get(id)?.props ?? {}}
      disabled={disabled}
      pending={isPending}
      emit={(event) => emit(id, event)}
    />
  );
}

function DisplayBinding({
  component: Component,
  id,
}: {
  readonly component: ComponentType<DisplayComponentProps>;
  readonly id: string;
}) {
  const { form } = useRuntime();
  return <Component id={id} props={form.components.get(id)?.props ?? {}} />;
}

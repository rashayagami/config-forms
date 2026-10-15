import {
  ConfigError,
  compileConfig,
  getAt,
  isEmptyValue,
  isVisible,
  isSelfVisible,
  resolveState,
  type Catalog,
  type CompiledForm,
  type FormValues,
  type NormalizedLayoutItem,
  type Option,
} from '@form-config/core';
import type { ReactNode } from 'react';

export interface SchemaResponseProps {
  /** The same authoring configuration the form was rendered from. */
  readonly config: unknown;
  /** Values as submitted (or as held by the form). */
  readonly values: FormValues;
  /** The catalog the config was compiled against; defaults to the built-ins. Pass `registry.catalog` for custom types. */
  readonly catalog?: Catalog;
  /** Shown for empty answers. Default "Not answered". */
  readonly emptyText?: string;
}

function format(
  form: CompiledForm,
  id: string,
  value: unknown,
  options: readonly Option[] | undefined,
  emptyText: string,
): ReactNode {
  const component = form.components.get(id);
  if (isEmptyValue(value)) return <span className="fc-response-empty">{emptyText}</span>;
  const label = (v: unknown) => options?.find((option) => option.value === v)?.label ?? String(v);
  switch (component?.value?.type) {
    case 'boolean':
      return value === true ? 'Yes' : 'No';
    case 'option':
      return label(value);
    case 'optionList':
      return Array.isArray(value) ? value.map(label).join(', ') : String(value);
    case 'string':
    case 'number':
    case 'date':
      return String(value);
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

function Items({
  form,
  items,
  values,
  rowPrefix,
  emptyText,
}: {
  readonly form: CompiledForm;
  readonly items: readonly NormalizedLayoutItem[];
  readonly values: FormValues;
  readonly rowPrefix: string;
  readonly emptyText: string;
}): ReactNode {
  return items.map((item) => {
    if (!isVisible(form, item.id, values, rowPrefix)) return null;
    if (item.kind === 'layout') {
      return (
        <Items
          key={item.id}
          form={form}
          items={item.children}
          values={values}
          rowPrefix={rowPrefix}
          emptyText={emptyText}
        />
      );
    }
    const component = form.components.get(item.id);
    if (!component?.value) return null;
    const title =
      typeof component.props['label'] === 'string' ? component.props['label'] : component.id;
    if (component.kind === 'repeater') {
      const rows = getAt(values, component.id);
      const itemLabel =
        typeof component.props['itemLabel'] === 'string' ? component.props['itemLabel'] : 'Item';
      return (
        <div key={item.id} className="fc-response-item">
          <dt>{title}</dt>
          <dd>
            {Array.isArray(rows) && rows.length > 0 ? (
              <ol className="fc-response-rows">
                {rows.map((_row, index) => (
                  <li key={index} aria-label={`${itemLabel} ${index + 1}`}>
                    <p className="fc-response-row-title">{`${itemLabel} ${index + 1}`}</p>
                    <dl className="fc-response-list">
                      <Items
                        form={form}
                        items={component.layout ?? []}
                        values={values}
                        rowPrefix={`${component.id}.${index}.`}
                        emptyText={emptyText}
                      />
                    </dl>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="fc-response-empty">{emptyText}</span>
            )}
          </dd>
        </div>
      );
    }
    const state = resolveState(form, component.id, values, rowPrefix);
    return (
      <div key={`${rowPrefix}${item.id}`} className="fc-response-item">
        <dt>{title}</dt>
        <dd>
          {format(
            form,
            component.id,
            getAt(values, form.pathOf(component.id, rowPrefix)),
            state.options,
            emptyText,
          )}
        </dd>
      </div>
    );
  });
}

/**
 * A read-only view of answers, laid out like the form. It holds no form state
 * and uses no hooks, so it renders in React Server Components as well as on
 * the client. Hidden components and pages are left out.
 */
export function SchemaResponse({
  config,
  values,
  catalog,
  emptyText = 'Not answered',
}: SchemaResponseProps) {
  const result = compileConfig(config, catalog ? { catalog } : {});
  if (!result.ok) throw new ConfigError([...result.errors, ...result.warnings]);
  const { form } = result;
  return (
    <div className="fc-root">
      <div className="fc-container fc-response">
        {form.config.title ? <h2 className="fc-title">{form.config.title}</h2> : null}
        {form.config.pages.map((page) =>
          form.config.mode === 'pages' && !isSelfVisible(form, page.id, values) ? null : (
            <section
              key={page.id}
              className="fc-response-page"
              aria-label={page.title ?? undefined}
            >
              {form.config.mode === 'pages' && page.title ? (
                <h3 className="fc-page-title">{page.title}</h3>
              ) : null}
              <dl className="fc-response-list">
                <Items
                  form={form}
                  items={page.layout}
                  values={values}
                  rowPrefix=""
                  emptyText={emptyText}
                />
              </dl>
            </section>
          ),
        )}
      </div>
    </div>
  );
}

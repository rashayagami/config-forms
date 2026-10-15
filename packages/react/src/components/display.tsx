import type {
  ControlComponentProps,
  DisplayComponentProps,
  RepeaterComponentProps,
} from '../registry.js';
import { ActionButton } from './action-button.js';
import { PlusIcon } from './icons.js';

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export function Heading({ props }: DisplayComponentProps) {
  const level = props['level'] === 3 ? 3 : props['level'] === 4 ? 4 : 2;
  const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
  return <Tag className="fc-heading">{str(props['text'])}</Tag>;
}

export function Paragraph({ props }: DisplayComponentProps) {
  return <p className="fc-paragraph">{str(props['text'])}</p>;
}

export function AlertBox({ props }: DisplayComponentProps) {
  const tone = str(props['tone']) ?? 'info';
  const title = str(props['title']);
  return (
    <div
      className="fc-alert"
      data-tone={tone}
      role={tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <p className="fc-alert-title">{title}</p> : null}
      <p className="fc-alert-text">{str(props['text'])}</p>
    </div>
  );
}

export function Divider() {
  return <hr className="fc-divider" />;
}

export function ButtonControl({ props, disabled, pending, emit }: ControlComponentProps) {
  return (
    <div className="fc-control">
      <ActionButton
        variant={props['variant'] === 'primary' ? 'primary' : 'secondary'}
        disabled={disabled}
        pending={pending}
        onClick={() => emit('click')}
      >
        {str(props['label'])}
      </ActionButton>
    </div>
  );
}

export function RepeaterView({
  props,
  rows,
  add,
  canAdd,
  disabled,
  required,
  error,
}: RepeaterComponentProps) {
  const description = str(props['description']);
  return (
    <fieldset className="fc-repeater" disabled={disabled} aria-invalid={error ? true : undefined}>
      <legend className="fc-label">
        {str(props['label'])}
        {required ? (
          <span className="fc-required" aria-hidden>
            *
          </span>
        ) : null}
      </legend>
      {description ? <p className="fc-description">{description}</p> : null}
      {rows.length > 0 ? (
        <ol className="fc-repeater-rows">
          {rows.map((row) => (
            <li key={row.key} className="fc-repeater-row" aria-label={row.title}>
              <div className="fc-repeater-row-head">
                <span className="fc-repeater-row-title">{row.title}</span>
                {row.canRemove ? (
                  <ActionButton
                    variant="ghost"
                    onClick={row.remove}
                    aria-label={`Remove ${row.title}`}
                  >
                    Remove
                  </ActionButton>
                ) : null}
              </div>
              {row.content}
            </li>
          ))}
        </ol>
      ) : null}
      {canAdd ? (
        <div>
          <ActionButton onClick={add} icon={<PlusIcon />}>
            {str(props['addLabel']) ?? 'Add'}
          </ActionButton>
        </div>
      ) : null}
      {error ? (
        <p className="fc-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

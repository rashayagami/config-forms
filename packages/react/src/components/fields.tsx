'use client';
import { Checkbox } from '@base-ui/react/checkbox';
import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Combobox } from '@base-ui/react/combobox';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { NumberField } from '@base-ui/react/number-field';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Select } from '@base-ui/react/select';
import { Switch } from '@base-ui/react/switch';
import type { Option, OptionValue } from '@form-config/core';
import type { ReactNode, Ref } from 'react';
import type { FieldComponentProps } from '../registry.js';
import { usePortalContainer } from '../theme/theme-provider.js';
import { CheckIcon, ChevronIcon, CloseIcon, MinusIcon, PlusIcon } from './icons.js';

/** A field's props without its ref, which the frames do not need. */
type FieldState = Omit<FieldComponentProps, 'inputRef'>;

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

function RequiredMark({ required }: { readonly required: boolean }) {
  return required ? (
    <span className="fc-required" aria-hidden>
      *
    </span>
  ) : null;
}

/**
 * Label, description and error around a control, wired through Base UI's
 * Field so the label and messages are linked to the control for assistive
 * technology. react-hook-form owns the state; Field only reflects it.
 */
function FieldFrame({
  field,
  children,
  label = true,
}: {
  readonly field: FieldState;
  readonly children: ReactNode;
  readonly label?: boolean;
}) {
  const description = str(field.props['description']);
  return (
    <Field.Root
      name={field.name}
      className="fc-field"
      invalid={field.invalid}
      touched={field.touched}
      dirty={field.dirty}
      disabled={field.disabled}
    >
      {label ? (
        <Field.Label className="fc-label">
          {str(field.props['label'])}
          <RequiredMark required={field.required} />
        </Field.Label>
      ) : null}
      {description ? (
        <Field.Description className="fc-description">{description}</Field.Description>
      ) : null}
      {children}
      <Field.Error className="fc-error" match={field.invalid}>
        {field.error}
      </Field.Error>
    </Field.Root>
  );
}

/** Label, description and error for a group of choices, with a legend instead of a label. */
function ChoiceFrame({
  field,
  children,
}: {
  readonly field: FieldState;
  readonly children: (legend: ReactNode) => ReactNode;
}) {
  const description = str(field.props['description']);
  const legend = (
    <Fieldset.Legend className="fc-label">
      {str(field.props['label'])}
      <RequiredMark required={field.required} />
    </Fieldset.Legend>
  );
  return (
    <Field.Root
      name={field.name}
      className="fc-field"
      invalid={field.invalid}
      touched={field.touched}
      dirty={field.dirty}
      disabled={field.disabled}
    >
      {children(
        <>
          {legend}
          {description ? (
            <Field.Description className="fc-description">{description}</Field.Description>
          ) : null}
        </>,
      )}
      <Field.Error className="fc-error" match={field.invalid}>
        {field.error}
      </Field.Error>
    </Field.Root>
  );
}

export function TextField({ inputRef, ...field }: FieldComponentProps) {
  const p = field.props;
  return (
    <FieldFrame field={field}>
      <Field.Control
        ref={inputRef as Ref<HTMLInputElement>}
        className="fc-input"
        type={str(p['inputType']) ?? 'text'}
        value={typeof field.value === 'string' ? field.value : ''}
        onValueChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
        placeholder={str(p['placeholder'])}
        autoComplete={str(p['autoComplete'])}
        readOnly={field.readOnly}
        aria-required={field.required || undefined}
      />
    </FieldFrame>
  );
}

export function TextareaField({ inputRef, ...field }: FieldComponentProps) {
  const p = field.props;
  return (
    <FieldFrame field={field}>
      <Field.Control
        ref={inputRef as Ref<HTMLInputElement>}
        render={<textarea rows={num(p['rows']) ?? 3} />}
        className="fc-input fc-textarea"
        value={typeof field.value === 'string' ? field.value : ''}
        onValueChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
        placeholder={str(p['placeholder'])}
        readOnly={field.readOnly}
        aria-required={field.required || undefined}
      />
    </FieldFrame>
  );
}

export function NumberInputField({ inputRef, ...field }: FieldComponentProps) {
  const p = field.props;
  return (
    <FieldFrame field={field}>
      <NumberField.Root
        value={typeof field.value === 'number' ? field.value : null}
        onValueChange={(value) => field.onChange(value)}
        min={num(p['min'])}
        max={num(p['max'])}
        step={num(p['step']) ?? 1}
        disabled={field.disabled}
        readOnly={field.readOnly}
        allowOutOfRange
      >
        <NumberField.Group className="fc-number">
          <NumberField.Decrement className="fc-number-step" aria-label="Decrease">
            <MinusIcon />
          </NumberField.Decrement>
          <NumberField.Input
            ref={inputRef as Ref<HTMLInputElement>}
            className="fc-input"
            onBlur={field.onBlur}
            placeholder={str(p['placeholder'])}
            aria-required={field.required || undefined}
          />
          <NumberField.Increment className="fc-number-step" aria-label="Increase">
            <PlusIcon />
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
    </FieldFrame>
  );
}

export function DateField({ inputRef, ...field }: FieldComponentProps) {
  const p = field.props;
  return (
    <FieldFrame field={field}>
      <Field.Control
        ref={inputRef as Ref<HTMLInputElement>}
        className="fc-input fc-date"
        type="date"
        value={typeof field.value === 'string' ? field.value : ''}
        onValueChange={(value) => field.onChange(value === '' ? null : value)}
        onBlur={field.onBlur}
        min={str(p['min'])}
        max={str(p['max'])}
        readOnly={field.readOnly}
        aria-required={field.required || undefined}
      />
    </FieldFrame>
  );
}

function OptionItems({ options }: { readonly options: readonly Option[] }) {
  return options.map((option) => (
    <Select.Item
      key={String(option.value)}
      value={option.value}
      disabled={option.disabled ?? false}
      className="fc-option"
    >
      <Select.ItemIndicator className="fc-option-indicator">
        <CheckIcon />
      </Select.ItemIndicator>
      <Select.ItemText>{option.label}</Select.ItemText>
    </Select.Item>
  ));
}

function SelectPopup({ options }: { readonly options: readonly Option[] }) {
  const container = usePortalContainer();
  return (
    <Select.Portal container={container}>
      <Select.Positioner className="fc-positioner" sideOffset={4} alignItemWithTrigger={false}>
        <Select.Popup className="fc-popup">
          <Select.List className="fc-list">
            <OptionItems options={options} />
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  );
}

export function SelectField({ inputRef, ...field }: FieldComponentProps) {
  const options = field.options ?? [];
  const selected = options.find((option) => option.value === field.value);
  return (
    <FieldFrame field={field}>
      <Select.Root<OptionValue>
        items={options.map((option) => ({ label: option.label, value: option.value }))}
        value={(field.value as OptionValue | null) ?? null}
        onValueChange={(value) => field.onChange(value ?? null)}
        onOpenChange={(open) => {
          if (!open) field.onBlur();
        }}
        inputRef={inputRef as Ref<HTMLInputElement>}
        disabled={field.disabled}
        readOnly={field.readOnly}
      >
        <Select.Trigger className="fc-input fc-trigger" aria-required={field.required || undefined}>
          <Select.Value className="fc-value" placeholder={str(field.props['placeholder'])}>
            {() =>
              selected?.label ?? (
                <span className="fc-placeholder">{str(field.props['placeholder'])}</span>
              )
            }
          </Select.Value>
          <Select.Icon className="fc-trigger-icon">
            <ChevronIcon />
          </Select.Icon>
        </Select.Trigger>
        <SelectPopup options={options} />
      </Select.Root>
    </FieldFrame>
  );
}

export function MultiSelectField({ inputRef, ...field }: FieldComponentProps) {
  const options = field.options ?? [];
  const value = Array.isArray(field.value) ? (field.value as OptionValue[]) : [];
  const labels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  return (
    <FieldFrame field={field}>
      <Select.Root<OptionValue, true>
        multiple
        items={options.map((option) => ({ label: option.label, value: option.value }))}
        value={value}
        onValueChange={(next) => field.onChange([...next])}
        onOpenChange={(open) => {
          if (!open) field.onBlur();
        }}
        inputRef={inputRef as Ref<HTMLInputElement>}
        disabled={field.disabled}
        readOnly={field.readOnly}
      >
        <Select.Trigger className="fc-input fc-trigger" aria-required={field.required || undefined}>
          <Select.Value className="fc-value">
            {() =>
              labels.length ? (
                labels.join(', ')
              ) : (
                <span className="fc-placeholder">{str(field.props['placeholder'])}</span>
              )
            }
          </Select.Value>
          <Select.Icon className="fc-trigger-icon">
            <ChevronIcon />
          </Select.Icon>
        </Select.Trigger>
        <SelectPopup options={options} />
      </Select.Root>
    </FieldFrame>
  );
}

export function ComboboxField({ inputRef, ...field }: FieldComponentProps) {
  const options = field.options ?? [];
  const selected = options.find((option) => option.value === field.value) ?? null;
  const container = usePortalContainer();
  return (
    <FieldFrame field={field}>
      <Combobox.Root
        items={options as Option[]}
        value={selected}
        onValueChange={(option: Option | null) => field.onChange(option ? option.value : null)}
        itemToStringLabel={(option: Option) => option.label}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        disabled={field.disabled}
        readOnly={field.readOnly}
      >
        <Combobox.InputGroup className="fc-input fc-combobox">
          <Combobox.Input
            ref={inputRef as Ref<HTMLInputElement>}
            className="fc-combobox-input"
            placeholder={str(field.props['placeholder'])}
            onBlur={field.onBlur}
            aria-required={field.required || undefined}
          />
          {selected && !field.disabled && !field.readOnly ? (
            <Combobox.Clear className="fc-icon-button" aria-label="Clear">
              <CloseIcon />
            </Combobox.Clear>
          ) : null}
          <Combobox.Trigger className="fc-icon-button" aria-label="Show options">
            <ChevronIcon />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal container={container}>
          <Combobox.Positioner className="fc-positioner" sideOffset={4}>
            <Combobox.Popup className="fc-popup">
              <Combobox.Empty className="fc-empty">{str(field.props['emptyText'])}</Combobox.Empty>
              <Combobox.List className="fc-list">
                {(option: Option) => (
                  <Combobox.Item
                    key={String(option.value)}
                    value={option}
                    disabled={option.disabled ?? false}
                    className="fc-option"
                  >
                    <Combobox.ItemIndicator className="fc-option-indicator">
                      <CheckIcon />
                    </Combobox.ItemIndicator>
                    <span>{option.label}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </FieldFrame>
  );
}

function ChoiceLabel({
  option,
  control,
}: {
  readonly option: Option;
  readonly control: ReactNode;
}) {
  return (
    <Field.Item className="fc-choice-item">
      <Field.Label className="fc-choice">
        {control}
        <span className="fc-choice-text">
          <span>{option.label}</span>
          {option.description ? <span className="fc-description">{option.description}</span> : null}
        </span>
      </Field.Label>
    </Field.Item>
  );
}

export function RadioField({ inputRef, ...field }: FieldComponentProps) {
  const options = field.options ?? [];
  return (
    <ChoiceFrame field={field}>
      {(legend) => (
        <Fieldset.Root
          className="fc-fieldset"
          render={
            <RadioGroup
              value={field.value ?? null}
              onValueChange={(value) => field.onChange(value)}
              inputRef={inputRef as Ref<HTMLInputElement>}
              disabled={field.disabled}
              readOnly={field.readOnly}
              aria-required={field.required || undefined}
            />
          }
        >
          {legend}
          <div
            className="fc-choices"
            data-orientation={str(field.props['orientation']) ?? 'vertical'}
          >
            {options.map((option) => (
              <ChoiceLabel
                key={String(option.value)}
                option={option}
                control={
                  <Radio.Root
                    value={option.value}
                    disabled={option.disabled ?? false}
                    className="fc-radio"
                    onBlur={field.onBlur}
                  >
                    <Radio.Indicator className="fc-radio-indicator" />
                  </Radio.Root>
                }
              />
            ))}
          </div>
        </Fieldset.Root>
      )}
    </ChoiceFrame>
  );
}

export function CheckboxGroupField({ inputRef, ...field }: FieldComponentProps) {
  const options = field.options ?? [];
  const value = Array.isArray(field.value) ? (field.value as string[]) : [];
  return (
    <ChoiceFrame field={field}>
      {(legend) => (
        <Fieldset.Root
          className="fc-fieldset"
          render={
            <CheckboxGroup
              value={value}
              onValueChange={(next) => field.onChange([...next])}
              disabled={field.disabled}
            />
          }
        >
          {legend}
          <div
            className="fc-choices"
            data-orientation={str(field.props['orientation']) ?? 'vertical'}
          >
            {options.map((option, index) => (
              <ChoiceLabel
                key={String(option.value)}
                option={option}
                control={
                  <Checkbox.Root
                    value={String(option.value)}
                    disabled={option.disabled ?? false}
                    readOnly={field.readOnly}
                    className="fc-checkbox"
                    inputRef={index === 0 ? (inputRef as Ref<HTMLInputElement>) : undefined}
                    onBlur={field.onBlur}
                  >
                    <Checkbox.Indicator className="fc-checkbox-indicator">
                      <CheckIcon />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                }
              />
            ))}
          </div>
        </Fieldset.Root>
      )}
    </ChoiceFrame>
  );
}

export function CheckboxField({ inputRef, ...field }: FieldComponentProps) {
  const description = str(field.props['description']);
  return (
    <Field.Root
      name={field.name}
      className="fc-field"
      invalid={field.invalid}
      touched={field.touched}
      dirty={field.dirty}
      disabled={field.disabled}
    >
      <Field.Label className="fc-choice">
        <Checkbox.Root
          checked={field.value === true}
          onCheckedChange={(checked) => field.onChange(checked)}
          inputRef={inputRef as Ref<HTMLInputElement>}
          onBlur={field.onBlur}
          readOnly={field.readOnly}
          className="fc-checkbox"
          aria-required={field.required || undefined}
        >
          <Checkbox.Indicator className="fc-checkbox-indicator">
            <CheckIcon />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className="fc-choice-text">
          <span>
            {str(field.props['label'])}
            <RequiredMark required={field.required} />
          </span>
        </span>
      </Field.Label>
      {description ? (
        <Field.Description className="fc-description">{description}</Field.Description>
      ) : null}
      <Field.Error className="fc-error" match={field.invalid}>
        {field.error}
      </Field.Error>
    </Field.Root>
  );
}

export function SwitchField({ inputRef, ...field }: FieldComponentProps) {
  const description = str(field.props['description']);
  return (
    <Field.Root
      name={field.name}
      className="fc-field"
      invalid={field.invalid}
      touched={field.touched}
      dirty={field.dirty}
      disabled={field.disabled}
    >
      <Field.Label className="fc-choice fc-switch-label">
        <span className="fc-choice-text">
          <span>
            {str(field.props['label'])}
            <RequiredMark required={field.required} />
          </span>
        </span>
        <Switch.Root
          checked={field.value === true}
          onCheckedChange={(checked) => field.onChange(checked)}
          inputRef={inputRef as Ref<HTMLInputElement>}
          onBlur={field.onBlur}
          readOnly={field.readOnly}
          className="fc-switch"
        >
          <Switch.Thumb className="fc-switch-thumb" />
        </Switch.Root>
      </Field.Label>
      {description ? (
        <Field.Description className="fc-description">{description}</Field.Description>
      ) : null}
      <Field.Error className="fc-error" match={field.invalid}>
        {field.error}
      </Field.Error>
    </Field.Root>
  );
}

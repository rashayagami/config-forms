import { builtInComponents, type ComponentSpec } from '@form-config/core';
import type { ComponentType } from 'react';
import {
  AlertBox,
  ButtonControl,
  Divider,
  Heading,
  Paragraph,
  RepeaterView,
} from './components/display.js';
import {
  CheckboxField,
  CheckboxGroupField,
  ComboboxField,
  DateField,
  MultiSelectField,
  NumberInputField,
  RadioField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from './components/fields.js';
import { createRegistry, type ComponentDefinition, type ComponentRegistry } from './registry.js';

const implementations: Record<string, ComponentType<never>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberInputField,
  date: DateField,
  select: SelectField,
  combobox: ComboboxField,
  multiselect: MultiSelectField,
  radio: RadioField,
  'checkbox-group': CheckboxGroupField,
  checkbox: CheckboxField,
  switch: SwitchField,
  repeater: RepeaterView,
  heading: Heading,
  paragraph: Paragraph,
  alert: AlertBox,
  divider: Divider,
  button: ButtonControl,
};

function definitionFor(spec: ComponentSpec): ComponentDefinition {
  const component = implementations[spec.type];
  if (!component) throw new Error(`No built-in implementation for "${spec.type}"`);
  return { spec, component } as ComponentDefinition;
}

/** Definitions of every built-in component, by type, for `withComponent` or selective registries. */
export const builtInDefinitions: Readonly<Record<string, ComponentDefinition>> = Object.freeze(
  Object.fromEntries(builtInComponents.map((spec) => [spec.type, definitionFor(spec)])),
);

/** Every built-in component, rendered with Base UI. */
export const defaultRegistry: ComponentRegistry = createRegistry(Object.values(builtInDefinitions));

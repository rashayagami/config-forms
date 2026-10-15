/**
 * @form-config/react: render form-config JSON with Base UI controls and
 * react-hook-form state.
 *
 * Client components (SchemaForm, ThemeProvider, the built-in fields) carry
 * "use client" in their own modules. SchemaResponse has no hooks and renders
 * in React Server Components. Import the styles once: "@form-config/react/styles.css".
 */
export {
  SchemaForm,
  type SchemaFormProps,
  type SubmitHandler,
  type SubmitContext,
} from './form/schema-form.js';
export {
  createActionRegistry,
  defaultActionRegistry,
  builtInActionDefinitions,
  type ActionRegistry,
  type ActionDefinition,
  type ActionHandler,
  type ActionContext,
  type FormController,
} from './form/actions.js';
export type { SubmissionState, SubmissionStatus } from './form/store.js';
export {
  createRegistry,
  withComponent,
  type ComponentRegistry,
  type ComponentDefinition,
  type FieldComponentProps,
  type DisplayComponentProps,
  type ControlComponentProps,
  type RepeaterComponentProps,
  type RepeaterRow,
} from './registry.js';
export { defaultRegistry, builtInDefinitions } from './default-registry.js';
export { ActionButton, type ActionButtonProps } from './components/action-button.js';
export {
  ThemeProvider,
  useTheme,
  type ThemeProviderProps,
  type ThemeInput,
  type ThemeSelection,
  type ColorScheme,
  type ThemeInfo,
} from './theme/theme-provider.js';
export { SchemaResponse, type SchemaResponseProps } from './response-view.js';

import type { FormConfig, JsonValue, OptionValue } from './config.js';

type OptionValues<C> = C extends { readonly options: readonly { readonly value: infer V }[] }
  ? V extends OptionValue
    ? V
    : never
  : OptionValue;

/** The value type of one built-in component; custom field types are `JsonValue`. */
export type ComponentValue<C> = C extends { readonly type: 'text' | 'textarea' }
  ? string
  : C extends { readonly type: 'number' }
    ? number | null
    : C extends { readonly type: 'date' }
      ? string | null
      : C extends { readonly type: 'checkbox' | 'switch' }
        ? boolean
        : C extends { readonly type: 'select' | 'combobox' | 'radio' }
          ? OptionValues<C> | null
          : C extends { readonly type: 'multiselect' | 'checkbox-group' }
            ? OptionValues<C>[]
            : JsonValue;

type NonValueTypes = 'heading' | 'paragraph' | 'alert' | 'divider' | 'button';

/** Ids listed directly in some repeater's `item`. */
type ItemIds<Cs> = Cs extends readonly (infer C)[]
  ? C extends { readonly type: 'repeater'; readonly item: readonly (infer I)[] }
    ? Extract<I, string>
    : never
  : never;

type ById<Cs, Id> = Cs extends readonly (infer C)[]
  ? C extends { readonly id: Id }
    ? C
    : never
  : never;

type RowOf<Cs, R> = R extends { readonly item: readonly (infer I)[] }
  ? { -readonly [K in Extract<I, string>]: ComponentValue<ById<Cs, K>> }
  : Record<string, unknown>;

/**
 * Submitted values of a config declared with `defineConfig`, keyed by
 * component id. Repeater rows are typed from the ids listed directly in their
 * `item`. Fields that a dependency can hide may be absent at runtime (with
 * hiddenValues "omit"); this type does not express that.
 */
export type InferValues<Config extends FormConfig> = {
  -readonly [
    C in Config['components'][number] as C extends { readonly type: NonValueTypes }
      ? never
      : C['id'] extends ItemIds<Config['components']>
        ? never
        : C['id']
  ]: C extends { readonly type: 'repeater' } ? RowOf<Config['components'], C>[] : ComponentValue<C>;
};

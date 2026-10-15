import {
  compileConfig,
  type CompileOptions,
  type CompiledForm,
  type ConfigIssue,
} from '../src/index.js';
import eventRegistration from '../../../examples/event-registration.json' with { type: 'json' };
import petAdoption from '../../../examples/pet-adoption.json' with { type: 'json' };
import tripBooking from '../../../examples/trip-booking.json' with { type: 'json' };

export { eventRegistration, petAdoption, tripBooking };

export function compiled(config: unknown, options?: CompileOptions): CompiledForm {
  const result = compileConfig(config, options);
  if (!result.ok)
    throw new Error(
      `expected a valid config, got:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`,
    );
  return result.form;
}

export function errorsOf(config: unknown, options?: CompileOptions): readonly ConfigIssue[] {
  const result = compileConfig(config, options);
  if (result.ok) throw new Error('expected the config to be invalid');
  return result.errors;
}

/** A small valid config to mutate in tests. */
export function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    id: 'test',
    components: [
      { id: 'name', type: 'text', label: 'Name' },
      {
        id: 'kind',
        type: 'select',
        label: 'Kind',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      },
    ],
    layout: ['name', 'kind'],
    ...overrides,
  };
}

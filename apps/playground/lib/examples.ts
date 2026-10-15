import type { ThemeInput } from '@form-config/react';
import eventRegistration from '../../../examples/event-registration.json';
import petAdoption from '../../../examples/pet-adoption.json';
import tripBooking from '../../../examples/trip-booking.json';
import companyTheme from '../../../examples/themes/my-company.json';
import oceanTheme from '../../../examples/themes/ocean.json';

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly config: unknown;
}

export const examples: readonly Example[] = [
  {
    id: 'event-registration',
    title: 'Event registration',
    summary:
      'One page, sections and a row, conditional and conditionally required fields, a clear effect.',
    config: eventRegistration,
  },
  {
    id: 'pet-adoption',
    title: 'Pet adoption',
    summary:
      'Four pages submitted page by page, a page shown by a condition, a repeater with row-level rules.',
    config: petAdoption,
  },
  {
    id: 'trip-booking',
    title: 'Trip booking',
    summary:
      'Three pages submitted once, a combobox, options that change with the destination, a jump-back action.',
    config: tripBooking,
  },
];

export const themes: Readonly<Record<string, ThemeInput>> = {
  'my-company': companyTheme,
  ocean: oceanTheme,
};

/** Waits like a network call would, so busy states are visible. */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

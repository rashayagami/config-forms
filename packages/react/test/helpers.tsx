import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactElement, type ReactNode } from 'react';
import eventRegistration from '../../../examples/event-registration.json' with { type: 'json' };
import petAdoption from '../../../examples/pet-adoption.json' with { type: 'json' };
import tripBooking from '../../../examples/trip-booking.json' with { type: 'json' };

export { eventRegistration, petAdoption, tripBooking };

/** Renders in Strict Mode, as an application would in development. */
export function renderStrict(
  ui: ReactElement,
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const result = render(<StrictMode>{ui}</StrictMode>);
  // Keep StrictMode on rerender: dropping it would change the tree and remount everything.
  return {
    ...result,
    user,
    rerender: (next: ReactNode) => result.rerender(<StrictMode>{next}</StrictMode>),
  };
}

/** Resolves after pending promises and microtasks settle. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

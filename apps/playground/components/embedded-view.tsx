'use client';
import { SchemaForm } from '@form-config/react';
import eventRegistration from '../../../examples/event-registration.json';
import tripBooking from '../../../examples/trip-booking.json';

const longContent = {
  ...eventRegistration,
  id: 'longContent',
  title:
    'A form title long enough to wrap onto several lines in a narrow sidebar without pushing anything sideways',
  components: eventRegistration.components.map((component) =>
    component.id === 'fullName'
      ? {
          ...component,
          label:
            'Full legal name exactly as printed on your passport or national identity document',
          description:
            'https://example.com/a/very/long/url/that/has/no/natural/break/points/and/must/still/wrap/inside/the/sidebar',
        }
      : component,
  ),
};

export function EmbeddedView() {
  return (
    <div className="pg-dashboard">
      <aside className="pg-panel" aria-label="Sidebar" data-testid="sidebar">
        <SchemaForm config={tripBooking} handlers={{ 'agency.book': () => {} }} />
      </aside>
      <section className="pg-panel" aria-label="Main" data-testid="main">
        <SchemaForm config={longContent} onSubmit={() => {}} />
      </section>
    </div>
  );
}

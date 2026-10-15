import type { FormValues } from '@form-config/core';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaForm, type SubmitContext, type SubmitHandler } from '../src/index.js';
import { petAdoption, renderStrict, tripBooking } from './helpers.js';

const tripStart = { destination: 'OSL', departure: '2026-11-02', cabin: 'economy' };

describe('multi-page form, final submission', () => {
  it('validates the current page before moving on, and keeps answers across pages', async () => {
    const book = vi.fn<SubmitHandler>();
    const { user } = renderStrict(
      <SchemaForm config={tripBooking} handlers={{ 'agency.book': book }} />,
    );
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findAllByText('This field is required.')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Trip' })).toBeInTheDocument();

    const nights = screen.getByRole('textbox', { name: /Nights/ });
    await user.clear(nights);
    await user.type(nights, '5');
    await user.type(screen.getByLabelText(/Departure/), '2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // Departure is fixed; destination and cabin are still missing, so the page holds.
    await waitFor(() => expect(screen.getAllByText('This field is required.')).toHaveLength(2));
    expect(screen.getByRole('heading', { name: 'Trip' })).toBeInTheDocument();
    expect(nights).toHaveValue('5');
    expect(book).not.toHaveBeenCalled();
  });

  it('submits all pages once with the final handler, and reports a failing handler', async () => {
    let fail = true;
    const book = vi.fn<SubmitHandler>(async () => {
      if (fail) throw new Error('The agency is offline. Try again later.');
    });
    const { user } = renderStrict(
      <SchemaForm
        config={{ ...tripBooking, initialValues: tripStart }}
        handlers={{ 'agency.book': book }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Travellers' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: /Age/ }), '36');
    await user.click(screen.getByRole('button', { name: 'Add traveller' }));
    expect(screen.getAllByRole('textbox', { name: /Name/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // The new row is empty, so the page does not advance.
    expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Remove Traveller 2' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Options' })).toBeInTheDocument();

    // Back to an earlier page and forward again: values are kept.
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByRole('textbox', { name: /Name/ })).toHaveValue('Ada');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Options' });

    await user.click(screen.getByRole('button', { name: 'Book trip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The agency is offline. Try again later.',
    );
    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Book trip' }));
    await screen.findByText('Submitted.');
    expect(book).toHaveBeenCalledTimes(2);
    const [values, context] = book.mock.calls[1] as [FormValues, SubmitContext];
    expect(values).toEqual({
      destination: 'OSL',
      departure: '2026-11-02',
      nights: 3,
      cabin: 'economy',
      travellers: [{ travellerName: 'Ada', travellerAge: 36 }],
      extras: [],
      notes: '',
    });
    expect(context).toMatchObject({ formId: 'tripBooking', kind: 'final', pageId: 'options' });
  });

  it('jumps back to a page with a registered action, keeping values', async () => {
    const { user } = renderStrict(
      <SchemaForm
        config={{
          ...tripBooking,
          initialValues: {
            ...tripStart,
            travellers: [{ travellerName: 'Grace', travellerAge: 40 }],
          },
        }}
        handlers={{ 'agency.book': () => {} }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Edit travellers' }));
    expect(await screen.findByRole('textbox', { name: /Name/ })).toHaveValue('Grace');
  });

  it('sends the user to the page of the first error when the final validation fails', async () => {
    // Values that pass page by page but not as a whole: navigation skipped validation.
    const config = { ...tripBooking, navigation: { progress: 'steps', validateOnNext: false } };
    const book = vi.fn();
    const { user } = renderStrict(
      <SchemaForm config={config} handlers={{ 'agency.book': book }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Book trip' }));
    expect(await screen.findByRole('heading', { name: 'Trip' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Destination/ })).toHaveFocus(),
    );
    expect(book).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Progress' })).toBeInTheDocument();
  });
});

describe('multi-page form, per-step submission', () => {
  const applicant = { applicantName: 'Sam', phone: '+44 20 7946 0000', age: 30 };

  it('submits each page to its own handler with its own payload, then advances', async () => {
    const saveApplicant = vi.fn<SubmitHandler>();
    const saveHome = vi.fn<SubmitHandler>();
    const submitApplication = vi.fn<SubmitHandler>();
    const { user } = renderStrict(
      <SchemaForm
        config={{ ...petAdoption, initialValues: { ...applicant, housing: 'own' } }}
        handlers={{
          'shelter.saveApplicant': saveApplicant,
          'shelter.saveHome': saveHome,
          'shelter.submitApplication': submitApplication,
        }}
      />,
    );
    // A page with a handler offers its submission, not a bare Next.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await screen.findByRole('heading', { name: 'Your home' });
    expect(saveApplicant).toHaveBeenCalledTimes(1);
    expect(saveApplicant.mock.calls[0]?.[0]).toEqual(applicant);
    expect(saveApplicant.mock.calls[0]?.[1]).toMatchObject({ kind: 'step', pageId: 'applicant' });

    await user.click(screen.getByRole('switch', { name: /garden/ }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    // The garden shows the home-visit page, which has no handler of its own.
    await screen.findByRole('heading', { name: 'Home visit' });
    expect(saveHome.mock.calls[0]?.[0]).toMatchObject({
      ...applicant,
      housing: 'own',
      hasGarden: true,
      currentPets: [],
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Preferred visit day/), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review' });

    await user.click(screen.getByRole('checkbox', { name: /references/ }));
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    await screen.findByText('Submitted.');
    expect(submitApplication.mock.calls[0]?.[0]).toMatchObject({
      ...applicant,
      visitDay: '2026-12-01',
      consent: true,
    });
    expect(submitApplication.mock.calls[0]?.[1]).toMatchObject({ kind: 'final', pageId: 'review' });
  });

  it('stays on the page when a step handler fails, and keeps its values', async () => {
    const saveApplicant = vi
      .fn<SubmitHandler>()
      .mockRejectedValueOnce(new Error('Could not save. Check your connection.'));
    const { user } = renderStrict(
      <SchemaForm
        config={{ ...petAdoption, initialValues: applicant }}
        handlers={{
          'shelter.saveApplicant': saveApplicant,
          'shelter.saveHome': vi.fn(),
          'shelter.submitApplication': vi.fn(),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save. Check your connection.',
    );
    expect(screen.getByRole('heading', { name: 'About you' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveValue('Sam');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await screen.findByRole('heading', { name: 'Your home' });
    expect(saveApplicant).toHaveBeenCalledTimes(2);
  });

  it('does not call the handler when the page is invalid', async () => {
    const saveApplicant = vi.fn();
    const { user } = renderStrict(
      <SchemaForm
        config={petAdoption}
        handlers={{
          'shelter.saveApplicant': saveApplicant,
          'shelter.saveHome': vi.fn(),
          'shelter.submitApplication': vi.fn(),
        }}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: /Age/ }), '16');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('You must be 18 or over to adopt.')).toBeInTheDocument();
    expect(saveApplicant).not.toHaveBeenCalled();
  });

  it('asks for resubmission after a submitted page changes', async () => {
    const saveApplicant = vi.fn<SubmitHandler>();
    const { user } = renderStrict(
      <SchemaForm
        config={{ ...petAdoption, initialValues: { ...applicant, housing: 'own' } }}
        handlers={{
          'shelter.saveApplicant': saveApplicant,
          'shelter.saveHome': vi.fn(),
          'shelter.submitApplication': vi.fn(),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await user.click(await screen.findByRole('button', { name: 'Previous' }));
    await screen.findByRole('heading', { name: 'About you' });
    // Unchanged and already submitted: Next moves on without submitting again.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Your home' });
    expect(saveApplicant).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), ' Jones');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Your home' });
    expect(saveApplicant).toHaveBeenCalledTimes(2);
    expect(saveApplicant.mock.calls[1]?.[0]).toMatchObject({ applicantName: 'Sam Jones' });
  });
});

import { ConfigError, type FormValues } from '@form-config/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaForm, SchemaResponse } from '../src/index.js';
import { eventRegistration, renderStrict } from './helpers.js';

describe('single-page form', () => {
  it('renders fields from the config with linked labels', () => {
    renderStrict(<SchemaForm config={eventRegistration} onSubmit={() => {}} />);
    expect(
      screen.getByRole('heading', { name: 'Register for the conference' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Full name/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Email/ })).toHaveAttribute('type', 'email');
    expect(screen.getByRole('radiogroup', { name: /Ticket/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    // Hidden until the ticket is "student".
    expect(screen.queryByRole('textbox', { name: /Student card number/ })).not.toBeInTheDocument();
  });

  it('validates on submit, shows errors and does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    const { user } = renderStrict(<SchemaForm config={eventRegistration} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getAllByText('This field is required.')).toHaveLength(3)); // name, email, ticket
    expect(screen.getByText('This must be checked.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    // The first invalid field takes focus.
    expect(screen.getByRole('textbox', { name: /Full name/ })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: /Full name/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('shows a conditional field, requires it, and submits validated values', async () => {
    const onSubmit = vi.fn<(values: FormValues) => void>();
    const { user } = renderStrict(<SchemaForm config={eventRegistration} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /Full name/ }), 'Ada Lovelace');
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'ada@example.com');
    await user.click(screen.getByRole('radio', { name: /Student/ }));
    const studentId = await screen.findByRole('textbox', { name: /Student card number/ });
    await user.click(screen.getByRole('switch', { name: /Bringing a guest/ }));
    await user.click(screen.getByRole('checkbox', { name: /code of conduct/ }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() =>
      expect(
        within(studentId.closest('.fc-field') as HTMLElement).getByText('This field is required.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText('This field is required.')).toHaveLength(2); // student card and guest name
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(studentId, 'S-123');
    await user.type(screen.getByRole('textbox', { name: /Guest name/ }), 'Charles');
    await user.click(screen.getByRole('checkbox', { name: /Accessibility/ }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      ticket: 'student',
      studentId: 'S-123',
      sessions: ['a11y'],
      bringingGuest: true,
      guestName: 'Charles',
      dietary: '',
      terms: true,
    });
    expect(await screen.findByText('Submitted.')).toBeInTheDocument();
  });

  it('leaves hidden values out of the submission but keeps them in the form', async () => {
    const onSubmit = vi.fn<(values: FormValues) => void>();
    const { user } = renderStrict(
      <SchemaForm
        config={{
          ...eventRegistration,
          initialValues: { fullName: 'A', email: 'a@b.co', ticket: 'full', terms: true },
        }}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('switch', { name: /Bringing a guest/ }));
    await user.type(screen.getByRole('textbox', { name: /Guest name/ }), 'Kept');
    await user.click(screen.getByRole('switch', { name: /Bringing a guest/ }));
    expect(screen.queryByRole('textbox', { name: /Guest name/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('guestName');
    await user.click(screen.getByRole('switch', { name: /Bringing a guest/ }));
    expect(screen.getByRole('textbox', { name: /Guest name/ })).toHaveValue('Kept');
  });

  it('runs a clear effect when its condition becomes true', async () => {
    const { user } = renderStrict(
      <SchemaForm
        config={{ ...eventRegistration, initialValues: { ticket: 'full' } }}
        onSubmit={() => {}}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /Performance/ }));
    expect(screen.getByRole('checkbox', { name: /Performance/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /One day/ }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Performance/ })).not.toBeChecked(),
    );
    expect(screen.getByRole('checkbox', { name: /Performance/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('resets to the initial values', async () => {
    const { user } = renderStrict(<SchemaForm config={eventRegistration} onSubmit={() => {}} />);
    const name = screen.getByRole('textbox', { name: /Full name/ });
    await user.type(name, 'Someone');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(name).toHaveValue(''));
    expect(screen.queryByText('This field is required.')).not.toBeInTheDocument();
  });

  it('keeps two forms from the same config independent', async () => {
    const { user } = renderStrict(
      <>
        <SchemaForm config={eventRegistration} onSubmit={() => {}} />
        <SchemaForm config={eventRegistration} onSubmit={() => {}} />
      </>,
    );
    const [first, second] = screen.getAllByRole('textbox', { name: /Full name/ });
    await user.type(first as HTMLElement, 'One');
    expect(first).toHaveValue('One');
    expect(second).toHaveValue('');
  });

  it('rejects an invalid config before rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = {
      ...eventRegistration,
      components: [...eventRegistration.components, { id: 'x', type: 'slider', label: 'X' }],
    };
    expect(() => renderStrict(<SchemaForm config={config} onSubmit={() => {}} />)).toThrow(
      ConfigError,
    );
  });

  it('requires the handlers and validators a config names', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderStrict(<SchemaForm config={eventRegistration} />)).toThrow('needs onSubmit');
  });
});

describe('SchemaResponse', () => {
  it('shows answers with option labels and skips hidden fields', () => {
    renderStrict(
      <SchemaResponse
        config={eventRegistration}
        values={{
          fullName: 'Ada',
          email: '',
          ticket: 'full',
          sessions: ['a11y', 'perf'],
          bringingGuest: false,
          guestName: 'x',
          dietary: '',
          terms: true,
        }}
      />,
    );
    const term = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling;
    expect(term('Ticket')).toHaveTextContent('Full conference');
    expect(term('Workshops')).toHaveTextContent('Accessibility, Performance');
    expect(term('Email')).toHaveTextContent('Not answered');
    expect(term('I agree to the code of conduct')).toHaveTextContent('Yes');
    expect(screen.queryByText('Guest name')).not.toBeInTheDocument();
    expect(screen.queryByText('Student card number')).not.toBeInTheDocument();
  });
});

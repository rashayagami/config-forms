import { describe, expect, it } from 'vitest';
import {
  createEffectTracker,
  nextPage,
  prepareSubmission,
  previousPage,
  resolveState,
  submissionForPage,
  validateValues,
  visiblePages,
  type FormValues,
} from '../src/index.js';
import { base, compiled, eventRegistration, petAdoption, tripBooking } from './helpers.js';

describe('resolveState', () => {
  const event = compiled(eventRegistration);
  const values = (overrides: FormValues = {}) => ({ ...event.getInitialValues(), ...overrides });

  it('shows a component only while its show rule holds', () => {
    expect(resolveState(event, 'studentId', values()).visible).toBe(false);
    expect(resolveState(event, 'studentId', values({ ticket: 'student' })).visible).toBe(true);
  });

  it('applies require, disable and the component defaults', () => {
    expect(resolveState(event, 'guestName', values()).required).toBe(false);
    expect(resolveState(event, 'guestName', values({ bringingGuest: true }))).toMatchObject({
      visible: true,
      required: true,
    });
    expect(resolveState(event, 'sessions', values({ ticket: 'day' })).disabled).toBe(true);
    expect(resolveState(event, 'sessions', values({ ticket: 'full' })).disabled).toBe(false);
    expect(resolveState(event, 'fullName', values()).required).toBe(true);
  });

  it('resolves contradictory rules deterministically: hide, disable and optional win', () => {
    const form = compiled(
      base({
        components: [
          { id: 'flag', type: 'switch', label: 'Flag' },
          { id: 'name', type: 'text', label: 'Name', required: true },
        ],
        layout: ['flag', 'name'],
        dependencies: [
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'show', target: 'name' },
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'hide', target: 'name' },
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'enable', target: 'name' },
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'disable', target: 'name' },
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'optional', target: 'name' },
        ],
      }),
    );
    expect(resolveState(form, 'name', { flag: true, name: '' })).toMatchObject({
      visible: false,
      disabled: true,
      required: false,
    });
    // With only "show"/"enable" rules present, the default is hidden/disabled until they hold.
    expect(resolveState(form, 'name', { flag: false, name: '' })).toMatchObject({
      visible: false,
      disabled: true,
      required: true,
    });
  });

  it('swaps options while an options rule holds', () => {
    const trip = compiled(tripBooking);
    const initial = trip.getInitialValues();
    expect(resolveState(trip, 'cabin', initial).options?.map((o) => o.value)).toEqual([
      'economy',
      'business',
    ]);
    expect(
      resolveState(trip, 'cabin', { ...initial, destination: 'HND' }).options?.map((o) => o.value),
    ).toEqual(['economy', 'premium', 'business']);
  });

  it('evaluates row-scoped rules per row', () => {
    const pets = compiled(petAdoption);
    const values = {
      currentPets: [
        { petKind: 'dog', petAge: 2, petNeutered: false },
        { petKind: 'other', petAge: 1, petNeutered: false },
      ],
    };
    expect(resolveState(pets, 'petNeutered', values, 'currentPets.0.').visible).toBe(true);
    expect(resolveState(pets, 'petNeutered', values, 'currentPets.1.').visible).toBe(false);
  });

  it('hides everything in a hidden container', () => {
    const form = compiled(
      base({
        components: [
          { id: 'flag', type: 'switch', label: 'Flag' },
          { id: 'name', type: 'text', label: 'Name' },
        ],
        layout: ['flag', { type: 'section', id: 'more', title: 'More', children: ['name'] }],
        dependencies: [
          { when: { field: 'flag', op: 'eq', value: true }, effect: 'hide', target: 'more' },
        ],
      }),
    );
    expect(resolveState(form, 'name', { flag: true, name: '' }).visible).toBe(false);
    expect(form.stateSources('name')).toEqual(['flag']);
  });
});

describe('validateValues', () => {
  const event = compiled(eventRegistration);
  const valid: FormValues = {
    ...event.getInitialValues(),
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    ticket: 'full',
    terms: true,
  };

  it('accepts valid values', () => {
    expect(validateValues(event, valid)).toEqual({ valid: true, errors: {} });
  });

  it('reports one message per field in layout order', () => {
    const result = validateValues(event, { ...event.getInitialValues(), email: 'nope' });
    expect(result.errors).toEqual({
      fullName: 'This field is required.',
      email: 'Enter an email address like name@example.com.',
      ticket: 'This field is required.',
      terms: 'This must be checked.',
    });
    expect(Object.keys(result.errors)).toEqual(['fullName', 'email', 'ticket', 'terms']);
  });

  it('skips hidden fields and validates them once shown', () => {
    expect(validateValues(event, { ...valid, ticket: 'full' }).valid).toBe(true);
    expect(validateValues(event, { ...valid, ticket: 'student' }).errors).toEqual({
      studentId: 'This field is required.',
    });
  });

  it('applies conditional requirement from dependencies', () => {
    expect(validateValues(event, { ...valid, bringingGuest: true }).errors).toEqual({
      guestName: 'This field is required.',
    });
  });

  it('skips disabled fields', () => {
    const tooMany = { ...valid, sessions: ['design', 'a11y', 'perf'] };
    expect(validateValues(event, tooMany).errors).toEqual({ sessions: 'Choose no more than 2.' });
    expect(validateValues(event, { ...tooMany, ticket: 'day' }).valid).toBe(true);
  });

  it('validates only the requested paths', () => {
    const result = validateValues(event, event.getInitialValues(), { names: ['email'] });
    expect(result.errors).toEqual({ email: 'This field is required.' });
  });

  it('rejects values outside the effective options, as tampered input would be', () => {
    expect(validateValues(event, { ...valid, ticket: 'vip' }).errors).toEqual({
      ticket: 'Choose one of the listed options.',
    });
  });

  it('validates repeater rows, and a repeater path covers its rows', () => {
    const trip = compiled(tripBooking);
    const values = {
      ...trip.getInitialValues(),
      travellers: [{ travellerName: '', travellerAge: 140 }],
    };
    expect(validateValues(trip, values, { names: ['travellers'] }).errors).toEqual({
      'travellers.0.travellerName': 'This field is required.',
      'travellers.0.travellerAge': 'Enter 120 or less.',
    });
    expect(validateValues(trip, values, { names: ['travellers.0.travellerAge'] }).errors).toEqual({
      'travellers.0.travellerAge': 'Enter 120 or less.',
    });
    expect(
      validateValues(trip, { ...values, travellers: [] }, { names: ['travellers'] }).errors,
    ).toEqual({
      travellers: 'This field is required.',
    });
  });

  it('skips fields on hidden pages and restricts to given pages', () => {
    const pets = compiled(petAdoption);
    const values = pets.getInitialValues();
    expect(Object.keys(validateValues(pets, values).errors)).not.toContain('visitDay');
    expect(Object.keys(validateValues(pets, { ...values, hasGarden: true }).errors)).toContain(
      'visitDay',
    );
    expect(Object.keys(validateValues(pets, values, { pages: ['applicant'] }).errors)).toEqual([
      'applicantName',
      'phone',
      'age',
    ]);
    expect(validateValues(pets, { ...values, age: 16 }, { names: ['age'] }).errors).toEqual({
      age: 'You must be 18 or over to adopt.',
    });
  });

  it('runs matches, patterns and registered validators', () => {
    const form = compiled(
      base({
        components: [
          {
            id: 'password',
            type: 'text',
            label: 'Password',
            inputType: 'password',
            validator: 'strong',
          },
          {
            id: 'confirm',
            type: 'text',
            label: 'Confirm password',
            inputType: 'password',
            matches: 'password',
          },
          { id: 'code', type: 'text', label: 'Code', pattern: '[A-Z]{3}' },
        ],
        layout: ['password', 'confirm', 'code'],
      }),
    );
    const validators = {
      strong: (value: unknown) =>
        typeof value === 'string' && value.length < 8 ? 'Use 8 or more characters.' : undefined,
    };
    expect(
      validateValues(form, { password: 'short', confirm: 'other', code: 'ABCD' }, { validators })
        .errors,
    ).toEqual({
      password: 'Use 8 or more characters.',
      confirm: 'This must match Password.',
      code: 'Enter a value in the expected format.',
    });
    expect(() => validateValues(form, { password: 'x', confirm: '', code: '' })).toThrow(
      'No validator is registered as "strong"',
    );
  });
});

describe('createEffectTracker', () => {
  it('fires set and clear only when a condition becomes true', () => {
    const event = compiled(eventRegistration);
    const tracker = createEffectTracker(event);
    const values: FormValues = {
      ...event.getInitialValues(),
      ticket: 'full',
      sessions: ['design'],
    };
    tracker.prime(values);
    expect(tracker.update(values, 'ticket')).toEqual([]);
    values['ticket'] = 'day';
    expect(tracker.update(values, 'ticket')).toEqual([{ path: 'sessions', value: [], rule: 4 }]);
    // Still true: nothing fires again.
    expect(tracker.update(values, 'ticket')).toEqual([]);
    // Unrelated changes are ignored without evaluating.
    expect(tracker.update(values, 'fullName')).toEqual([]);
  });

  it('does not fire for conditions that already hold when primed', () => {
    const trip = compiled(tripBooking);
    const tracker = createEffectTracker(trip);
    const values: FormValues = { ...trip.getInitialValues(), destination: 'HND', cabin: 'premium' };
    tracker.prime(values);
    values['destination'] = 'NBO';
    expect(tracker.update(values, 'destination')).toEqual([]);
    values['destination'] = 'LIS';
    expect(tracker.update(values, 'destination')).toEqual([
      { path: 'cabin', value: null, rule: 1 },
    ]);
  });

  it('tracks row-scoped rules per row and re-baselines when rows change', () => {
    const form = compiled(
      base({
        components: [
          { id: 'rows', type: 'repeater', label: 'Rows', item: ['gift', 'note'] },
          { id: 'gift', type: 'switch', label: 'Gift' },
          { id: 'note', type: 'text', label: 'Note' },
        ],
        layout: ['rows'],
        dependencies: [
          { when: { field: 'gift', op: 'eq', value: false }, effect: 'clear', target: 'note' },
        ],
      }),
    );
    const tracker = createEffectTracker(form);
    const values: { rows: { gift: boolean; note: string }[] } = {
      rows: [
        { gift: true, note: 'a' },
        { gift: true, note: 'b' },
      ],
    };
    tracker.prime(values);
    values.rows[1] = { gift: false, note: 'b' };
    expect(tracker.update(values, 'rows.1.gift')).toEqual([
      { path: 'rows.1.note', value: '', rule: 0 },
    ]);
    values.rows.push({ gift: false, note: 'c' });
    expect(tracker.update(values, 'rows')).toEqual([]);
  });
});

describe('navigation', () => {
  const pets = compiled(petAdoption);
  const values = pets.getInitialValues();

  it('skips hidden pages in both directions', () => {
    expect(visiblePages(pets, values)).toEqual(['applicant', 'home', 'review']);
    expect(nextPage(pets, values, 'home')).toBe('review');
    expect(previousPage(pets, values, 'review')).toBe('home');
    const withGarden = { ...values, hasGarden: true };
    expect(nextPage(pets, withGarden, 'home')).toBe('homeVisit');
    expect(previousPage(pets, withGarden, 'review')).toBe('homeVisit');
    expect(nextPage(pets, values, 'review')).toBeUndefined();
    expect(previousPage(pets, values, 'applicant')).toBeUndefined();
  });
});

describe('submission strategies', () => {
  it('final: only the last visible page submits, with the form handler', () => {
    const trip = compiled(tripBooking);
    const values = trip.getInitialValues();
    expect(submissionForPage(trip, values, 'trip')).toBeNull();
    expect(submissionForPage(trip, values, 'options')).toEqual({
      kind: 'final',
      handler: 'agency.book',
      label: 'Book trip',
    });
  });

  it('perStep: pages with a handler submit; pages without only navigate', () => {
    const pets = compiled(petAdoption);
    const values = pets.getInitialValues();
    expect(submissionForPage(pets, values, 'applicant')).toEqual({
      kind: 'step',
      handler: 'shelter.saveApplicant',
      payload: 'page',
      label: 'Save and continue',
      isLast: false,
    });
    expect(submissionForPage(pets, { ...values, hasGarden: true }, 'homeVisit')).toBeNull();
    expect(submissionForPage(pets, values, 'review')).toMatchObject({
      kind: 'step',
      handler: 'shelter.submitApplication',
      isLast: true,
    });
  });

  it('perStep: the form handler is final when the last visible page has none', () => {
    const form = compiled(
      base({
        layout: undefined,
        pages: [
          { id: 'one', layout: ['name'], submission: { handler: 'app.one' } },
          { id: 'two', layout: ['kind'] },
        ],
        submission: { strategy: 'perStep', handler: 'app.final' },
      }),
    );
    expect(submissionForPage(form, form.getInitialValues(), 'two')).toEqual({
      kind: 'final',
      handler: 'app.final',
      label: 'Submit',
    });
  });
});

describe('prepareSubmission', () => {
  const pets = compiled(petAdoption);
  const values: FormValues = {
    ...pets.getInitialValues(),
    applicantName: 'Sam',
    housing: 'own',
    landlordAllowsPets: true,
    currentPets: [{ petKind: 'other', petAge: 3, petNeutered: true }],
  };

  it('omits hidden components and hidden pages by default, without touching state', () => {
    const out = prepareSubmission<Record<string, unknown>>(pets, values);
    expect(out).not.toHaveProperty('landlordAllowsPets');
    expect(out).not.toHaveProperty('visitDay');
    expect(out['currentPets']).toEqual([{ petKind: 'other', petAge: 3 }]);
    expect(values['landlordAllowsPets']).toBe(true);
  });

  it('keeps hidden values when asked', () => {
    const out = prepareSubmission<Record<string, unknown>>(pets, values, { hiddenValues: 'keep' });
    expect(out['landlordAllowsPets']).toBe(true);
    expect(out).toHaveProperty('visitDay', null);
  });

  it('restricts to pages for a page payload, and copies values', () => {
    const out = prepareSubmission<Record<string, unknown>>(pets, values, { pages: ['applicant'] });
    expect(Object.keys(out)).toEqual(['applicantName', 'phone', 'age']);
    const all = prepareSubmission<{ currentPets: unknown[] }>(pets, values);
    expect(all.currentPets).not.toBe(values['currentPets']);
  });
});

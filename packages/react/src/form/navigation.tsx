'use client';
import { submissionForPage, visiblePages, type CompiledForm } from '@form-config/core';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { ActionButton } from '../components/action-button.js';
import { useRuntime } from './context.js';
import { useStore } from './store.js';

/** Re-renders when any value that decides page visibility changes, and returns the visible pages. */
export function useVisiblePages(form: CompiledForm): string[] {
  const { control, getValues } = useRuntime();
  const names = useMemo(() => {
    const set = new Set<string>();
    for (const page of form.pageOrder)
      for (const source of form.stateSources(page)) set.add(source);
    return [...set];
  }, [form]);
  useWatch({ control, name: names, disabled: names.length === 0 });
  return visiblePages(form, getValues());
}

export function Progress({ current }: { readonly current: string }) {
  const { form } = useRuntime();
  const pages = useVisiblePages(form);
  const style = form.config.navigation.progress;
  if (form.config.mode !== 'pages' || style === 'none') return null;
  const index = Math.max(0, pages.indexOf(current));
  const title = (id: string) => form.page(id)?.title ?? `Step ${pages.indexOf(id) + 1}`;
  if (style === 'bar') {
    return (
      <div className="fc-progress-bar">
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={pages.length}
          aria-valuenow={index + 1}
          aria-valuetext={`Step ${index + 1} of ${pages.length}: ${title(current)}`}
          className="fc-progress-track"
        >
          <div
            className="fc-progress-fill"
            style={{ width: `${((index + 1) / pages.length) * 100}%` }}
          />
        </div>
        <p className="fc-progress-label">
          Step {index + 1} of {pages.length}
        </p>
      </div>
    );
  }
  return (
    <nav aria-label="Progress" className="fc-steps">
      <ol>
        {pages.map((id, i) => (
          <li
            key={id}
            className="fc-step"
            data-state={i < index ? 'done' : i === index ? 'current' : 'upcoming'}
            aria-current={id === current ? 'step' : undefined}
          >
            <span className="fc-step-number" aria-hidden>
              {i + 1}
            </span>
            <span className="fc-step-title">{title(id)}</span>
            {id === current ? (
              <span className="fc-step-count">
                {' '}
                ({i + 1} of {pages.length})
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface FooterProps {
  readonly current: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
}

/**
 * The form's built-in actions: Previous, Next and the submission for the
 * current page under the configured strategy. Exactly one primary action,
 * written last so it sits rightmost. The submit button submits the <form>,
 * so Enter in a field does the same as pressing it.
 */
export function Footer({ current, onPrevious, onNext, onReset }: FooterProps) {
  const { form, getValues, submission: submissionStore } = useRuntime();
  const pages = useVisiblePages(form);
  const state = useStore(submissionStore, (s) => s);
  const { navigation, mode, showReset } = form.config;
  const submission = submissionForPage(form, getValues(), current);
  const index = pages.indexOf(current);
  const hasPrevious = mode === 'pages' && navigation.allowBack && index > 0;
  const hasNext = mode === 'pages' && index < pages.length - 1;
  const busy = state.status === 'submitting';
  const pageSubmitted = state.submittedPages[current] !== undefined;
  // Under perStep a page with a handler submits first; once submitted, Next is offered too.
  const showNext =
    hasNext && (submission === null || (submission.kind === 'step' && pageSubmitted));
  const nextIsPrimary = submission === null;

  return (
    <div className="fc-footer">
      <div className="fc-footer-status" aria-live="polite">
        {state.status === 'failed' && state.pageId === current ? (
          <p className="fc-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.status === 'succeeded' && state.kind === 'final' ? (
          <p className="fc-success">Submitted.</p>
        ) : null}
        {state.status === 'succeeded' && state.kind === 'step' && state.pageId === current ? (
          <p className="fc-success">Saved.</p>
        ) : null}
      </div>
      <div className="fc-footer-actions">
        {hasPrevious ? (
          <ActionButton onClick={onPrevious} disabled={busy}>
            {navigation.previousLabel}
          </ActionButton>
        ) : null}
        {showReset ? (
          <ActionButton variant="ghost" onClick={onReset} disabled={busy}>
            Reset
          </ActionButton>
        ) : null}
        {showNext ? (
          <ActionButton
            variant={nextIsPrimary ? 'primary' : 'secondary'}
            onClick={onNext}
            disabled={busy}
          >
            {navigation.nextLabel}
          </ActionButton>
        ) : null}
        {submission ? (
          <ActionButton variant="primary" type="submit" pending={busy && state.pageId === current}>
            {submission.label}
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}

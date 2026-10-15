'use client';
import { Button as BaseButton } from '@base-ui/react/button';
import type { ReactNode } from 'react';

export interface ActionButtonProps {
  readonly children: ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  /**
   * Shows a spinner over the label and disables the button, keeping its size,
   * so nothing beside it moves while an action runs.
   */
  readonly pending?: boolean;
  readonly onClick?: () => void;
  readonly icon?: ReactNode;
  readonly 'aria-label'?: string;
}

export function ActionButton({
  children,
  variant = 'secondary',
  type = 'button',
  disabled,
  pending,
  onClick,
  icon,
  ...aria
}: ActionButtonProps) {
  return (
    <BaseButton
      type={type}
      className="fc-button"
      data-variant={variant}
      data-pending={pending ? '' : undefined}
      disabled={Boolean(disabled || pending)}
      focusableWhenDisabled={Boolean(pending)}
      aria-busy={pending || undefined}
      onClick={onClick}
      {...aria}
    >
      <span className="fc-button-content">
        {icon}
        {children}
      </span>
      {pending ? <span className="fc-spinner" aria-hidden /> : null}
    </BaseButton>
  );
}

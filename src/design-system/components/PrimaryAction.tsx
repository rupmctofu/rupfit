/*
 * The one primary action of a screen (§7.1), and the text button that takes over
 * when two actions would otherwise compete for the accent.
 *
 * Both are real <button> elements: keyboard activation, focus and the semantics
 * VoiceOver relies on come free, and no div ever pretends to be a control (§9).
 */

import type { IconName } from './Icon';
import { Icon } from './Icon';
import '../foundation.css';
import './actions.css';

export interface PrimaryActionProps {
  readonly children: React.ReactNode;
  readonly onClick?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  /** Optional leading glyph, e.g. `play` on `Empezar entrenamiento`. */
  readonly icon?: IconName | undefined;
  readonly className?: string | undefined;
}

export function PrimaryAction({
  children,
  onClick,
  disabled = false,
  icon,
  className,
}: PrimaryActionProps): React.ReactElement {
  const classes = ['ds-action', 'ds-primary', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      {icon === undefined ? null : <Icon name={icon} size={19} />}
      <span className="ds-primary__label">{children}</span>
    </button>
  );
}

export interface TextButtonProps {
  readonly children: React.ReactNode;
  readonly onClick?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly icon?: IconName | undefined;
  /** `start` for the inline actions that sit on a data row (`Cambiar`). */
  readonly align?: 'center' | 'start' | undefined;
  /** `quiet` (default) is primary ink; `danger` for destructive rows; `accent` is rare. */
  readonly tone?: 'quiet' | 'accent' | 'danger' | undefined;
  readonly className?: string | undefined;
}

/**
 * A text button keeps its 48 px hit area through padding, never through a wrapper
 * that shifts the layout (§3). There is no hover-only affordance anywhere (§11).
 */
export function TextButton({
  children,
  onClick,
  disabled = false,
  icon,
  align = 'center',
  tone = 'quiet',
  className,
}: TextButtonProps): React.ReactElement {
  const classes = [
    'ds-action',
    'ds-text-button',
    `ds-text-button--${align}`,
    tone === 'quiet' ? '' : `ds-text-button--${tone}`,
    className ?? '',
  ]
    .filter((p) => p !== '')
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      {icon === undefined ? null : <Icon name={icon} size={19} />}
      <span>{children}</span>
    </button>
  );
}

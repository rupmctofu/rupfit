/*
 * Chips and pills (§7.3, §7.8): the colour-coded words of the system.
 *
 * A chip always carries a word — `RÉCORD`, `duro`, `media incompleta` — so colour
 * is never the only carrier of meaning (§4, §11). When a chip is a control (an
 * effort toggle, a discomfort chip) it is a real <button> with `aria-pressed` and a
 * 48 px target: the pill keeps the artboard's 26 px look, the hit area does not.
 */

import type { IconName } from './Icon';
import { Icon } from './Icon';
import '../foundation.css';
import './chips.css';

export type ChipTone =
  | 'neutral'
  | 'selected'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'
  | 'solid';

export interface ChipProps {
  readonly children: React.ReactNode;
  readonly tone?: ChipTone | undefined;
  readonly icon?: IconName | undefined;
  /** The 6 px dot the artboard puts in front of meaningful chips. */
  readonly dot?: boolean | undefined;
  /** Makes the chip a toggle button. */
  readonly onClick?: (() => void) | undefined;
  /** Toggle state; only meaningful with `onClick`. */
  readonly pressed?: boolean | undefined;
  /** Accessible name when the visible word is abbreviated. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

function pillClasses(tone: ChipTone, className: string | undefined): string {
  return ['ds-chip', `ds-chip--${tone}`, className ?? ''].filter((p) => p !== '').join(' ');
}

function Pill({ children, tone, icon, dot, className }: ChipProps): React.ReactElement {
  return (
    <span className={pillClasses(tone ?? 'neutral', className)}>
      {icon === undefined ? null : <Icon name={icon} size={14} />}
      {dot === true ? <span className="ds-chip__dot" aria-hidden="true" /> : null}
      <span className="ds-chip__text">{children}</span>
    </span>
  );
}

export function Chip(props: ChipProps): React.ReactElement {
  const { onClick, pressed = false, label } = props;

  if (onClick === undefined) {
    return <Pill {...props} />;
  }

  // The pressed state is tinted, never filled: a row of lime pills makes the accent the
  // background of the screen instead of the mark of the one thing that matters (§4).
  // The choice still reads without relying on colour alone: it gains weight and a label.
  const tone: ChipTone = pressed ? 'selected' : (props.tone ?? 'neutral');

  return (
    <button
      type="button"
      className="ds-action ds-chip-control"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
    >
      <Pill {...props} tone={tone} />
    </button>
  );
}

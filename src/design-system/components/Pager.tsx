/*
 * The paging control of the session (§7.2, §7.3).
 *
 * Swipe is a shortcut, never the only route: two 48 px chevrons scroll by one card
 * and carry names, not glyphs, and the position is exposed as a group label so
 * VoiceOver says `Ejercicio 2 de 6` (§9). The caller owns the scroll container; this
 * component only reports intent, so `scrollIntoView({ behavior })` stays in the
 * screen where `prefers-reduced-motion` turns it into `auto`.
 */

import { Icon } from './Icon';
import '../foundation.css';
import './pager.css';

export interface PagerProps {
  /** 1-based position of the card on screen. */
  readonly position: number;
  readonly total: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  /** What is being paged: `Ejercicio`. */
  readonly noun?: string | undefined;
  readonly previousLabel?: string | undefined;
  readonly nextLabel?: string | undefined;
}

export function Pager({
  position,
  total,
  onPrevious,
  onNext,
  noun = 'Ejercicio',
  previousLabel,
  nextLabel,
}: PagerProps): React.ReactElement {
  const percent = total <= 0 ? 0 : Math.round((position / total) * 100);

  return (
    <div className="ds-pager" role="group" aria-label={`${noun} ${position} de ${total}`}>
      <button
        type="button"
        className="ds-action ds-pager__chevron"
        onClick={onPrevious}
        disabled={position <= 1}
        aria-label={previousLabel ?? `${noun} anterior`}
      >
        <Icon name="chevronLeft" size={20} />
      </button>
      <span className="ds-pager__track" aria-hidden="true">
        <span className="ds-pager__fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="ds-numeral ds-pager__count" aria-hidden="true">
        {position} / {total}
      </span>
      <button
        type="button"
        className="ds-action ds-pager__chevron"
        onClick={onNext}
        disabled={position >= total}
        aria-label={nextLabel ?? `${noun} siguiente`}
      >
        <Icon name="chevronRight" size={20} />
      </button>
    </div>
  );
}

/*
 * The rest bar (§7.5) — a design-system component, no longer part of the session.
 *
 * The Sesión screen has no rest timer (S5): recording a set never opens a countdown and
 * nothing has to be dismissed before the next set, so this bar is not rendered there any
 * more. It stays exported because the design-system gallery (`src/app/gallery`, out of
 * this task's scope) still draws its three states; the prescribed rest survives only as
 * the card's text line (`descanso 180 s`).
 *
 * 60 px of content above the home indicator plus safe-area padding, the remaining
 * time in tabular figures, `+15 s`, `Saltar` and a 2 px progress line. It stays
 * visible while the user pages to another exercise.
 *
 * The timer is derived, not accumulated (§6.4): this component is told the remaining
 * and elapsed labels by its caller, which computes them from `confirmedAt`. It never
 * runs an interval and never reads the clock — a backgrounded page cannot, and a
 * countdown that pretends otherwise is the one lie the design cannot afford.
 *
 * The remaining time is NOT a live region: announcing every second makes VoiceOver
 * unusable. Instead the bar carries a static label (`accessibleLabel`) and one
 * polite announcement when the rest ends (§7.5, §9).
 */

import { Icon } from './Icon';
import '../foundation.css';
import './rest-timer-bar.css';

export type RestState = 'running' | 'finished';

export interface RestTimerBarProps {
  readonly state: RestState;
  /** Remaining time, already formatted: `1:45`. */
  readonly remainingLabel: string;
  /** 0…1 elapsed fraction of the rest. */
  readonly progress: number;
  /** `Descanso, quedan 1 minuto 45 segundos`, built by the caller. */
  readonly accessibleLabel: string;
  /** `hace 1:12`: how long ago the rest ended. Only for the finished state. */
  readonly overrunLabel?: string | undefined;
  readonly onExtend?: (() => void) | undefined;
  readonly onSkip?: (() => void) | undefined;
  readonly onDismiss?: (() => void) | undefined;
  readonly extendLabel?: string | undefined;
  readonly skipLabel?: string | undefined;
  readonly dismissLabel?: string | undefined;
  readonly finishedLabel?: string | undefined;
  readonly label?: string | undefined;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function RestTimerBar({
  state,
  remainingLabel,
  progress,
  accessibleLabel,
  overrunLabel,
  onExtend,
  onSkip,
  onDismiss,
  extendLabel = '+15 s',
  skipLabel = 'Saltar',
  dismissLabel = 'Cerrar el descanso',
  finishedLabel = 'DESCANSO TERMINADO',
  label = 'Descanso',
}: RestTimerBarProps): React.ReactElement {
  const finished = state === 'finished';
  const percent = clamp(progress) * 100;
  const classes = ['ds-rest', finished ? 'ds-rest--finished' : 'ds-rest--running'].join(' ');

  return (
    <div className={classes} role="group" aria-label={accessibleLabel}>
      <div className="ds-rest__main">
        <span className="ds-section-label ds-rest__label">
          <Icon name="clock" size={14} />
          {finished ? finishedLabel : label}
        </span>
        <span className="ds-numeral ds-rest__time">{finished ? (overrunLabel ?? remainingLabel) : remainingLabel}</span>
      </div>

      <div className="ds-rest__actions">
        {onExtend === undefined ? null : (
          <button type="button" className="ds-action ds-rest__action" onClick={onExtend}>
            {extendLabel}
          </button>
        )}
        {onSkip === undefined ? null : (
          <button type="button" className="ds-action ds-rest__action" onClick={onSkip}>
            {skipLabel}
          </button>
        )}
        {finished && onDismiss !== undefined ? (
          <button
            type="button"
            className="ds-action ds-rest__action"
            onClick={onDismiss}
            aria-label={dismissLabel}
          >
            <Icon name="chevronDown" size={20} />
          </button>
        ) : null}
      </div>

      <span className="ds-rest__track" aria-hidden="true">
        <span className="ds-rest__line" style={{ width: `${percent}%` }} />
      </span>

      {/* One polite announcement when the rest ends; never a per-second one. */}
      <span className="ds-visually-hidden" role="status">
        {finished ? finishedLabel : ''}
      </span>
    </div>
  );
}

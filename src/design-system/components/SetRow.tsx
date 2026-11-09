/*
 * The set row (§7.3): `SERIE n`, the target or the achieved reps, an optional
 * effort, an optional discomfort and one confirm target.
 *
 * Two taps confirm a set: the rep count, then the confirm target. Effort and
 * discomfort are optional and never block confirmation, and an unanswered set looks
 * unanswered (`sin esfuerzo`), never defaulted.
 *
 * Feedback is visual because iOS exposes no vibration API (§6.3): a confirmed row
 * changes in three ways at once — the word `COMPLETADA` in its accessible name, a
 * `success` check glyph, and the word plus dot on the effort chip. Colour is never
 * the only signal (§4).
 */

import type { ChipTone } from './Chip';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { Stepper } from './Stepper';
import '../foundation.css';
import './set-row.css';

export type SetState = 'pending' | 'active' | 'confirmed' | 'corrected' | 'skipped';
export type Effort = 'fácil' | 'correcto' | 'duro' | 'fallo';
export type Discomfort = 'molestia' | 'dolor';

export const EFFORT_OPTIONS: readonly Effort[] = ['fácil', 'correcto', 'duro', 'fallo'];
export const DISCOMFORT_OPTIONS: readonly Discomfort[] = ['molestia', 'dolor'];

const STATE_WORD: Record<SetState, string> = {
  pending: 'pendiente',
  active: 'en curso',
  confirmed: 'completada',
  corrected: 'corregida',
  skipped: 'saltada',
};

const EFFORT_TONE: Record<Effort, ChipTone> = {
  fácil: 'success',
  correcto: 'success',
  duro: 'accent',
  fallo: 'warning',
};

export interface SetRowProps {
  /** 1-based, as shown: `Serie 1`. */
  readonly index: number;
  readonly targetReps: number;
  readonly state: SetState;
  /** The current count while active, the achieved count once confirmed. */
  readonly reps?: number | undefined;
  /// The weight this set is done at, already formatted with its unit (`92,5 kg`). A
  /// set row without it is a row the user cannot act on.
  readonly weightLabel?: string | undefined;
  readonly effort?: Effort | null | undefined;
  readonly discomfort?: Discomfort | null | undefined;
  /** A personal record is a word, not a green number (§6.3). */
  readonly record?: boolean | undefined;
  readonly onRepsChange?: ((reps: number) => void) | undefined;
  readonly onConfirm?: (() => void) | undefined;
  readonly onEffortChange?: ((effort: Effort | null) => void) | undefined;
  readonly onDiscomfortChange?: ((discomfort: Discomfort | null) => void) | undefined;
  /** Extra affordance that reveals `molestia · dolor`; the chips start hidden. */
  readonly onShowDiscomfort?: (() => void) | undefined;
  readonly showDiscomfort?: boolean | undefined;
  readonly disabled?: boolean | undefined;
}

function announced(props: SetRowProps): string {
  const { index, targetReps, state, reps } = props;
  const count = reps ?? targetReps;
  const parts = [`Serie ${index}`, STATE_WORD[state], `${count} de ${targetReps} repeticiones`];
  if (props.weightLabel !== undefined) parts.push(props.weightLabel);
  if (props.effort != null) parts.push(props.effort);
  if (props.discomfort != null) parts.push(props.discomfort);
  if (props.record === true) parts.push('récord');
  return parts.join(', ');
}

export function SetRow(props: SetRowProps): React.ReactElement {
  const {
    index,
    targetReps,
    state,
    reps,
    weightLabel,
    effort,
    discomfort,
    record = false,
    onRepsChange,
    onConfirm,
    onEffortChange,
    onDiscomfortChange,
    onShowDiscomfort,
    showDiscomfort = false,
    disabled = false,
  } = props;

  const current = reps ?? targetReps;
  const classes = ['ds-set', `ds-set--${state}`, state === 'active' ? 'ds-set--expanded' : '']
    .filter((p) => p !== '')
    .join(' ');

  const effortChips =
    state !== 'active' || onEffortChange === undefined ? null : (
      <div className="ds-set__chips">
        {EFFORT_OPTIONS.map((option) => (
          <Chip
            key={option}
            onClick={() => onEffortChange(effort === option ? null : option)}
            pressed={effort === option}
            label={`Esfuerzo: ${option}`}
          >
            {option}
          </Chip>
        ))}
        {showDiscomfort || discomfort != null ? (
          DISCOMFORT_OPTIONS.map((option) => (
            <Chip
              key={option}
              tone="danger"
              onClick={() => onDiscomfortChange?.(discomfort === option ? null : option)}
              pressed={discomfort === option}
              label={`Molestia: ${option}`}
            >
              {option}
            </Chip>
          ))
        ) : onShowDiscomfort === undefined ? null : (
          <Chip onClick={onShowDiscomfort} label="Añadir molestia o dolor">
            + molestia
          </Chip>
        )}
      </div>
    );

  return (
    <div className={classes} role="group" aria-label={announced(props)}>
      <span className="ds-set__index">Serie {index}</span>

      {state === 'active' ? (
        <div className="ds-set__body">
          <div className="ds-set__line">
            {onRepsChange === undefined ? (
              <span className="ds-set__reps">{current} reps</span>
            ) : (
              <Stepper
                value={current}
                onChange={onRepsChange}
                label={`Repeticiones de la serie ${index}`}
                decrementLabel="Una repetición menos"
                incrementLabel="Una repetición más"
                min={0}
                max={99}
                disabled={disabled}
              />
            )}
            {weightLabel === undefined ? null : (
              <span className="ds-set__weight">{weightLabel}</span>
            )}
            {onConfirm === undefined ? null : (
              <button
                type="button"
                className="ds-action ds-set__confirm"
                onClick={onConfirm}
                disabled={disabled}
                aria-label={`Confirmar serie ${index} con ${current} repeticiones`}
              >
                Confirmar
              </button>
            )}
          </div>
          {effortChips}
        </div>
      ) : (
        <>
          <span className="ds-set__reps">
            {state === 'confirmed' || state === 'corrected'
              ? `${current} / ${targetReps}`
              : `${targetReps} reps`}
          </span>
          {weightLabel === undefined ? null : (
            <span className="ds-set__weight">{weightLabel}</span>
          )}
          <span className="ds-set__right">
            {record ? (
              <Chip tone="success" dot>
                RÉCORD
              </Chip>
            ) : null}
            {discomfort != null ? (
              <Chip tone="danger" dot>
                {discomfort}
              </Chip>
            ) : null}
            {state === 'confirmed' || state === 'corrected' ? (
              effort == null ? (
                <Chip>sin esfuerzo</Chip>
              ) : (
                <Chip tone={EFFORT_TONE[effort]} dot>
                  {effort}
                </Chip>
              )
            ) : null}
            {state === 'skipped' ? <Chip tone="warning">saltada</Chip> : null}
            {state === 'pending' ? (
              onConfirm === undefined ? (
                <span className="ds-set__mark" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className="ds-action ds-set__confirm-target"
                  onClick={onConfirm}
                  disabled={disabled}
                  aria-label={`Confirmar serie ${index} con ${targetReps} repeticiones`}
                >
                  <span className="ds-set__mark" aria-hidden="true" />
                </button>
              )
            ) : (
              <span
                className={
                  state === 'confirmed' || state === 'corrected'
                    ? 'ds-set__mark ds-set__mark--done'
                    : 'ds-set__mark'
                }
                aria-hidden="true"
              >
                {state === 'confirmed' || state === 'corrected' ? <Icon name="check" size={14} /> : null}
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

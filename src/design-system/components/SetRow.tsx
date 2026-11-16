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
 *
 * A confirmed row can be **held** to be corrected (odd/tasks/edit-set.md S2): no button
 * appears for it — the row is already full — and a plain tap still does nothing. The row
 * only says that it is holdable (`holdable`, which is also the accessible name) and lets
 * the press through untouched: no `preventDefault`, no `touch-action` override, so the
 * horizontal swipe between exercises and the vertical scroll of the sheet keep working.
 * The press rule itself lives with the screen that owns it (`features/session/editSet.ts`),
 * because 500 ms and 10 px are this product's decision, not the design system's.
 * `SetEditor` below is what a held row opens.
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

/* Effort is the user's own word, not a verdict the app repeats per set: lime on
   `fácil`/`correcto`/`duro` made the accent a decoration of every confirmed row (§4).
   `fallo` keeps `warning`, the state that still needs attention. */
const EFFORT_TONE: Record<Effort, ChipTone> = {
  fácil: 'neutral',
  correcto: 'neutral',
  duro: 'neutral',
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
  /**
   * S2: the row can be held to be corrected, and it is reachable from a keyboard too —
   * `Enter` and `Space` do exactly what a completed 500 ms press does. It adds no control:
   * the hint sentence under the list is the only visible affordance, and a plain tap still
   * does nothing.
   */
  readonly onActivate?: (() => void) | undefined;
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
  // The affordance is announced, never drawn: a visible control per row is exactly what
  // the owner refused (S2). Both paths are named, because a long press alone is unreachable
  // with a screen reader or a desktop keyboard.
  if (props.onActivate !== undefined) {
    parts.push('mantén pulsada o pulsa Intro para corregirla');
  }
  return parts.join(', ');
}

/**
 * The optional answers of a set: `fácil · correcto · duro · fallo`, plus `molestia ·
 * dolor` once they are revealed. Shared by the active row and the correction editor, so
 * correcting a set really does offer the same chips the card already renders (S4).
 */
function answersChips(props: {
  readonly effort: Effort | null | undefined;
  readonly onEffortChange: ((effort: Effort | null) => void) | undefined;
  readonly discomfort: Discomfort | null | undefined;
  readonly onDiscomfortChange: ((discomfort: Discomfort | null) => void) | undefined;
  readonly showDiscomfort: boolean;
  readonly onShowDiscomfort: (() => void) | undefined;
}): React.ReactElement {
  const { effort, onEffortChange, discomfort, onDiscomfortChange, showDiscomfort } = props;

  return (
    <div className="ds-set__chips">
      {EFFORT_OPTIONS.map((option) => (
        <Chip
          key={option}
          onClick={() => onEffortChange?.(effort === option ? null : option)}
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
      ) : props.onShowDiscomfort === undefined ? null : (
        <Chip onClick={props.onShowDiscomfort} label="Añadir molestia o dolor">
          + molestia
        </Chip>
      )}
    </div>
  );
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
    onActivate,
    disabled = false,
  } = props;

  const current = reps ?? targetReps;
  const classes = [
    'ds-set',
    `ds-set--${state}`,
    state === 'active' ? 'ds-set--expanded' : '',
    onActivate === undefined ? '' : 'ds-set--holdable ds-focusable',
  ]
    .filter((p) => p !== '')
    .join(' ');

  /**
   * S2, the keyboard half: `Enter` and `Space` are the press the owner cannot make. Space is
   * prevented because its default is to scroll the sheet away from the row being corrected.
   */
  const onKeyDown =
    onActivate === undefined
      ? undefined
      : (event: React.KeyboardEvent<HTMLDivElement>): void => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onActivate();
        };

  const effortChips =
    state !== 'active' || onEffortChange === undefined ? null : (
      answersChips({
        effort,
        onEffortChange,
        discomfort,
        onDiscomfortChange,
        showDiscomfort,
        onShowDiscomfort,
      })
    );

  return (
    <div
      className={classes}
      role="group"
      aria-label={announced(props)}
      {...(onActivate === undefined
        ? {}
        : { tabIndex: 0, onKeyDown, 'aria-roledescription': 'serie corregible' })}
    >
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
              /* The word `RÉCORD` already carries it; the lime dot repeated it in every
                 record row (§4). */
              <Chip dot>
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

/* ------------------------------------------------------- correcting a set (S2) */

export interface SetEditorProps {
  /** 1-based, as shown: `Serie 1`. The slot never changes: correcting does not renumber. */
  readonly index: number;
  /** What the set had: the kilos, the reps and the answers the editor starts from. */
  readonly targetReps: number;
  /** Already formatted with its unit (`92,5 kg`) — this component formats nothing. */
  readonly weightLabel: string;
  readonly reps: number;
  readonly effort: Effort | null;
  readonly discomfort: Discomfort | null;
  readonly showDiscomfort?: boolean | undefined;
  readonly onRepsChange: (reps: number) => void;
  readonly onEffortChange: (effort: Effort | null) => void;
  readonly onDiscomfortChange: (discomfort: Discomfort | null) => void;
  readonly onShowDiscomfort?: (() => void) | undefined;
  /**
   * `Cambiar` on the kilos: the screen opens its one pinned keypad, bound to this set.
   * The editor never draws a second pad of its own (S2, S4).
   */
  readonly onEditWeight: () => void;
  readonly disabled?: boolean | undefined;
}

/**
 * A confirmed set, opened in place: the same `Serie n`, the same rep stepper the active row
 * uses, the same effort and discomfort chips, and the kilos one tap away from the pad that
 * already exists. It carries **no** save or cancel of its own — both live in the sheet's
 * pinned bar, where the thumb already is — so the row keeps the numbers and the bar keeps
 * the decision.
 */
export function SetEditor(props: SetEditorProps): React.ReactElement {
  const {
    index,
    targetReps,
    weightLabel,
    reps,
    effort,
    discomfort,
    showDiscomfort = false,
    onRepsChange,
    onEffortChange,
    onDiscomfortChange,
    onShowDiscomfort,
    onEditWeight,
    disabled = false,
  } = props;

  return (
    <div
      className="ds-set ds-set--expanded ds-set--editing"
      role="group"
      aria-label={`Corrigiendo la serie ${index}: ${reps} de ${targetReps} repeticiones, ${weightLabel}`}
    >
      <span className="ds-set__index">Serie {index}</span>
      <div className="ds-set__body">
        <div className="ds-set__line">
          <Stepper
            value={reps}
            onChange={onRepsChange}
            label={`Repeticiones de la serie ${index}`}
            decrementLabel="Una repetición menos"
            incrementLabel="Una repetición más"
            min={0}
            max={99}
            disabled={disabled}
          />
          <button
            type="button"
            className="ds-action ds-set__weight-key"
            onClick={onEditWeight}
            disabled={disabled}
            aria-label={`Kilos de la serie ${index}: ${weightLabel}. Cambiar`}
          >
            {weightLabel}
          </button>
        </div>
        {answersChips({
          effort,
          onEffortChange,
          discomfort,
          onDiscomfortChange,
          showDiscomfort,
          onShowDiscomfort,
        })}
      </div>
    </div>
  );
}

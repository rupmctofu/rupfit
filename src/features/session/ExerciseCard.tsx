/**
 * One exercise card of the session sheet (§7.2): name, position, previous session,
 * the two compare tiles, the one-line reason, the last-six-sessions strip, the set rows
 * and the weight summary once the load is decided. The strip is context and steps aside
 * while a set row is being filled; `stripBars` below still computes it either way.
 *
 * The card is composed here rather than in `src/design-system`, exactly as that library
 * documents: the page container and its state machine belong to the screen. Everything
 * visual comes from a component or a token; the only numbers this file decides are the
 * bar heights of the strip, which are data.
 *
 * Read-only when it is not the card on screen: a card you swiped away from still shows
 * its sets, but nothing on it can be confirmed by accident.
 *
 * The open row shows the two numbers the owner is looking at — the reps it is counting
 * and the weight on the bar — and the screen's pinned bar registers them
 * (`Registrar serie`). The row has no confirm of its own: that button is the bar's, in
 * every state, so the screen never shows two accent fills and nothing has to be
 * dismissed between sets.
 *
 * A **confirmed** row can be held for 500 ms to be corrected (odd/tasks/edit-set.md S2).
 * The gesture is read by `HoldableRow` below, which wraps the row and adds no control of
 * its own; the rule lives in `editSet.ts`. While one row is open in the editor the card is
 * read-only (`interactive` false): the row being corrected is the only thing that answers,
 * and the sheet never shows two weight pads at once.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Exercise, ExercisePrescription } from '../../core/domain';
import type { ExerciseState, SetEntry } from '../../core/session/model';
import { formatReason } from '../../core/engine/reasons';
import type { PlainRecommendation } from '../../core/session/model';
import {
  Card,
  Chip,
  CompareTile,
  SectionLabel,
  SetEditor,
  SetRow,
  TextButton,
  WeightSummary,
  type IconName,
  type SetState,
} from '../../design-system';
import type { HistoryPoint } from './controller';
import { substitutionNote } from './substitution';
import {
  LONG_PRESS_MS,
  pressCancelled,
  pressHeld,
  pressMoved,
  pressStarted,
  type PressGesture,
} from './editSet';
import {
  formatDiscomfort,
  formatEffort,
  formatWeight,
  setsAndWork,
  spanishDecimals,
  targetLine,
  type DiscomfortChip,
  type EffortChip,
} from './format';

export interface SetDraft {
  readonly weightKg: number;
  readonly reps: number;
  readonly effort: EffortChip | null;
  readonly discomfort: DiscomfortChip | null;
  readonly showDiscomfort: boolean;
}

/** The confirmed set the card has open in its editor, and what each answer writes. */
export interface EditingSet {
  /** The prescription slot (`Serie n`): the correction never changes it. */
  readonly slot: number;
  readonly draft: SetDraft;
  readonly onRepsChange: (reps: number) => void;
  readonly onEffortChange: (effort: EffortChip | null) => void;
  readonly onDiscomfortChange: (discomfort: DiscomfortChip | null) => void;
  readonly onShowDiscomfort: () => void;
  readonly onEditWeight: () => void;
}

export interface ExerciseCardProps {
  readonly exercise: ExerciseState;
  readonly detail: Exercise | undefined;
  readonly history: readonly HistoryPoint[];
  /** The weight of today: the decision, or the suggestion while none is made. */
  readonly todayWeightKg: number | null;
  readonly draft: SetDraft;
  /** This card is the one on screen and the session is still open. */
  readonly interactive: boolean;
  /**
   * The screen's hero already shows the exercise name, its prescription and today's
   * weight above the card. Repeating the title inside it made the first viewport a wall of
   * the same sentence twice; when the hero is there, the card keeps the chips and the
   * work, not the heading.
   */
  readonly heroShown?: boolean | undefined;
  /**
   * `Sugerir otro ejercicio` (S4). Absent when the library offers nothing or the swap is
   * too late — the card never shows an action that would be refused.
   */
  readonly onSuggestAlternative?: (() => void) | undefined;
  /** The exercise this card replaced for this session only, when it was substituted. */
  readonly substitutedFromName?: string | undefined;
  readonly onRepsChange: (reps: number) => void;
  readonly onEffortChange: (effort: EffortChip | null) => void;
  readonly onDiscomfortChange: (discomfort: DiscomfortChip | null) => void;
  readonly onShowDiscomfort: () => void;
  readonly onEditWeight: () => void;
  readonly onSkipRemaining: () => void;
  readonly onWeightStep: (delta: number) => void;
  /**
   * S2: a confirmed row of this card can be held to be corrected. Absent when the session
   * is closed, when this card is not the one on screen, or while another correction is
   * open — the row never promises a gesture that would be refused.
   */
  readonly onCorrectSet?: ((slot: number) => void) | undefined;
  /** The set this card has open in the editor, if any. */
  readonly editing?: EditingSet | undefined;
}

const EQUIPMENT_LABEL: Record<Exercise['equipment'], string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda',
};

const EQUIPMENT_ICON: Record<Exercise['equipment'], IconName> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  bodyweight: 'person',
  band: 'band',
};

const MUSCLE_LABEL: Record<Exercise['primaryMuscle'], string> = {
  quadriceps: 'Cuádriceps',
  hamstrings: 'Cadena posterior',
  glutes: 'Glúteos',
  adductors: 'Aductores',
  calves: 'Gemelos',
  lowerBack: 'Lumbar',
  chest: 'Pecho',
  shoulders: 'Hombros',
  triceps: 'Tríceps',
  lats: 'Dorsales',
  upperBack: 'Espalda alta',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  core: 'Core',
};

/** The reason templates throw on a missing value: a half sentence is never shown. */
function reasonText(recommendation: PlainRecommendation): string | null {
  try {
    return spanishDecimals(formatReason(recommendation.reason, recommendation.reasonContext));
  } catch {
    return null;
  }
}

function entryAt(exercise: ExerciseState, slot: number): SetEntry | undefined {
  return exercise.sets.find((entry) => entry.slot === slot);
}

function nextSlotOf(exercise: ExerciseState): number | null {
  for (let slot = 1; slot <= exercise.prescription.sets; slot += 1) {
    if (entryAt(exercise, slot) === undefined) return slot;
  }
  return null;
}

function pastBest(history: readonly HistoryPoint[]): number {
  return history.reduce((best, point) => (point.today ? best : Math.max(best, point.weightKg)), 0);
}

/**
 * S2: a confirmed row, held still for 500 ms, opens its editor. The wrapper adds no box
 * (`display: contents`), so the row it wraps keeps its place in the list, and it never
 * calls `preventDefault` and never touches `touch-action`: the sheet still scrolls, the
 * track still swipes, and either of those ends the press — the browser sends `pointerup`
 * or `pointercancel` and the timer goes with it. A plain tap therefore writes nothing.
 */
function HoldableRow({
  children,
  onLongPress,
}: {
  readonly children: React.ReactNode;
  readonly onLongPress: () => void;
}): React.ReactElement {
  const gesture = useRef<PressGesture | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    gesture.current = null;
  }, []);

  // Unmounting mid-press (a card swiped away, the session closing) fires nothing.
  useEffect(() => stop, [stop]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // One press at a time: a second finger is not this gesture.
    stop();
    gesture.current = pressStarted({ x: event.clientX, y: event.clientY }, Date.now());
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const held = pressHeld(gesture.current, Date.now());
      gesture.current = null;
      if (held) onLongPress();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (gesture.current === null) return;
    const moved = pressMoved(gesture.current, { x: event.clientX, y: event.clientY });
    gesture.current = moved;
    // Past the slop the sheet is scrolling or the track is swiping: not this press.
    if (moved.cancelled) stop();
  };

  const onPointerUp = (): void => stop();
  const onPointerCancel = (): void => stop();

  return (
    <div
      className="session-card__hold"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

function setRowFor(
  slot: number,
  entry: SetEntry | undefined,
  props: ExerciseCardProps,
  targetReps: number,
  activeSlot: number | null,
  best: number,
): React.ReactElement {
  if (entry !== undefined && entry.status === 'confirmed') {
    const editing = props.editing?.slot === slot ? props.editing : undefined;

    // The row being corrected shows the editor in its own place: the same `Serie n`, the
    // same position, and its neighbours are not renumbered by a pixel.
    if (editing !== undefined) {
      return (
        <SetEditor
          key={slot}
          index={slot}
          targetReps={entry.set.targetReps}
          weightLabel={`${formatWeight(editing.draft.weightKg)} kg`}
          reps={editing.draft.reps}
          effort={editing.draft.effort}
          discomfort={editing.draft.discomfort}
          showDiscomfort={editing.draft.showDiscomfort}
          onRepsChange={editing.onRepsChange}
          onEffortChange={editing.onEffortChange}
          onDiscomfortChange={editing.onDiscomfortChange}
          onShowDiscomfort={editing.onShowDiscomfort}
          onEditWeight={editing.onEditWeight}
        />
      );
    }

    const row = (
      <SetRow
        key={slot}
        index={slot}
        targetReps={entry.set.targetReps}
        state="confirmed"
        reps={entry.set.actualReps}
        weightLabel={`${formatWeight(entry.set.weightKg)} kg`}
        effort={formatEffort(entry.set.effort)}
        discomfort={formatDiscomfort(entry.set.discomfort)}
        record={best > 0 && entry.set.weightKg > best}
        {...(props.onCorrectSet === undefined ? {} : { onActivate: () => props.onCorrectSet?.(slot) })}
      />
    );

    if (props.onCorrectSet === undefined) return row;
    const onCorrectSet = props.onCorrectSet;
    return (
      <HoldableRow key={slot} onLongPress={() => onCorrectSet(slot)}>
        {row}
      </HoldableRow>
    );
  }

  if (entry !== undefined) {
    return <SetRow key={slot} index={slot} targetReps={targetReps} state="skipped" />;
  }

  const isActive = props.interactive && slot === activeSlot;
  const state: SetState = isActive ? 'active' : 'pending';
  // No decision yet means no weight to show: the bottom bar is still asking for one, and
  // the draft already carries the proposal, so a row would claim a weight the owner has
  // not accepted. `0 kg` never reaches the row either.
  const planned =
    props.exercise.decision !== null && props.draft.weightKg > 0
      ? `${formatWeight(props.draft.weightKg)} kg`
      : null;

  return (
    <SetRow
      key={slot}
      index={slot}
      targetReps={targetReps}
      state={state}
      {...(planned === null ? {} : { weightLabel: planned })}
      {...(isActive
        ? {
            reps: props.draft.reps,
            effort: props.draft.effort,
            discomfort: props.draft.discomfort,
            showDiscomfort: props.draft.showDiscomfort,
            onRepsChange: props.onRepsChange,
            onEffortChange: props.onEffortChange,
            onDiscomfortChange: props.onDiscomfortChange,
            onShowDiscomfort: props.onShowDiscomfort,
          }
        : {})}
    />
  );
}

/** The bars of the strip: the last five stored sessions plus the live one. */
function stripBars(
  history: readonly HistoryPoint[],
  todayWeightKg: number | null,
): readonly { readonly weightKg: number; readonly today: boolean }[] {
  const stored = history.slice(-6);
  const hasToday = stored.some((point) => point.today);
  return [
    ...stored.map((point) => ({ weightKg: point.weightKg, today: point.today })),
    ...(todayWeightKg !== null && !hasToday ? [{ weightKg: todayWeightKg, today: true }] : []),
  ].slice(-6);
}

/** The last six top sets: a bar per session, the live one in the accent hue. */
function HistoryStrip({
  bars,
  sets,
}: {
  readonly bars: readonly { readonly weightKg: number; readonly today: boolean }[];
  readonly sets: number;
}): React.ReactElement {
  const weights = bars.map((bar) => bar.weightKg);
  const heaviest = Math.max(...weights);
  const lightest = Math.min(...weights);
  // The bars compare with each other, not with zero: a 10 kg window must still show.
  const heightOf = (weightKg: number): number =>
    heaviest === lightest ? 70 : Math.round(25 + ((weightKg - lightest) / (heaviest - lightest)) * 75);
  const spoken = bars
    .map((bar) => `${formatWeight(bar.weightKg)} kg${bar.today ? ' hoy' : ''}`)
    .join(', ');

  return (
    <div className="session-strip">
      <div className="session-strip__head">
        <SectionLabel>Últimas 6 sesiones</SectionLabel>
        <span className="ds-caption">serie top</span>
      </div>
      <div className="session-strip__bars" aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={`${bar.weightKg}-${index}`} className="session-strip__column">
            <span
              className={bar.today ? 'session-strip__bar session-strip__bar--today' : 'session-strip__bar'}
              style={{ height: `${heightOf(bar.weightKg)}%` }}
            />
            <span className="session-strip__label">
              {bar.today ? 'hoy' : index === 0 ? formatWeight(bar.weightKg) : ''}
            </span>
          </span>
        ))}
      </div>
      <p className="ds-visually-hidden">
        {`Serie más pesada de las últimas ${bars.length} sesiones de ${sets} series: ${spoken}.`}
      </p>
    </div>
  );
}

export function ExerciseCard(props: ExerciseCardProps): React.ReactElement {
  const { exercise, detail, history, todayWeightKg, draft, interactive, heroShown } = props;
  const prescription = exercise.prescription;
  const previous = (() => {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const point = history[index];
      if (point !== undefined && !point.today) return point;
    }
    return null;
  })();

  const targetReps = exercise.recommendation?.suggestedTargetReps ?? prescription.repRange.lowerBound;
  const decided = exercise.decision !== null;
  const firstTime = previous === null;
  // No decision, no set: the render `sesion-decision` shows three untouched rows until
  // the owner picks a weight, and the first confirmation is what records the decision.
  const activeSlot = interactive && decided ? nextSlotOf(exercise) : null;
  const best = pastBest(history);
  const reason = exercise.recommendation === null ? null : reasonText(exercise.recommendation);
  // An open set row is the one thing the owner is working on (S1). The strip is context
  // nobody acts on mid-set, and on a 390 × 844 screen it was the loudest block above the
  // row, tall enough to push the effort chips below the fold at first paint. So the strip
  // and both of its hairlines step aside exactly while a set row is open — the stepper,
  // `Confirmar` and the chips state. It comes back while the weight is still to be decided
  // (no set row can be open then) and again once every set of the exercise is answered.
  // Only the render is decided here: the bars keep being computed the same way.
  const showHistoryStrip = activeSlot === null && props.editing === undefined;

  const slots: number[] = [];
  for (let slot = 1; slot <= prescription.sets; slot += 1) slots.push(slot);

  const title = (
    <div className="session-card__head">
      {heroShown === true ? null : (
        <h1 className="ds-card-title ds-card-title--large">{exercise.exerciseNameSnapshot}</h1>
      )}
      {/* No subtitle restating the previous session: the compare tiles below already say
          `Última vez 90 kg · 3 × 10` and the reason line says why today's weight changed.
          Three restatements of the same two numbers was the loudest thing on the screen. */}
      {detail === undefined ? null : (
        <div className="session-card__chips">
          <Chip icon={EQUIPMENT_ICON[detail.equipment]}>
            {EQUIPMENT_LABEL[detail.equipment]}
          </Chip>
          <Chip>{MUSCLE_LABEL[detail.primaryMuscle]}</Chip>
        </div>
      )}
    </div>
  );

  const bars = stripBars(history, todayWeightKg);

  return (
    <Card className="session-card" label={`Ejercicio: ${exercise.exerciseNameSnapshot}`}>
      {title}
      {/* The read-out of a swap (S4, S6): the card is the substitute, the plan is not,
          and the original keeps its own history. Shown whether or not the card is the
          one on screen, because it is a fact about the session, not a control. */}
      {props.substitutedFromName === undefined ? null : (
        <p className="session-card__substitution ds-caption">
          {substitutionNote(props.substitutedFromName)}
        </p>
      )}
      {/* The rule under the head belongs to the block that follows it: the weight
          summary, or the first-time explanation. With history and no decision the
          compare tiles sit directly under the chips, as the render draws them. */}
      {decided || firstTime ? <hr className="ds-hairline" /> : null}

      {decided ? (
        <WeightSummary
          weight={formatWeight(draft.weightKg)}
          targetLine={targetLine(prescription)}
          onDecrement={interactive ? () => props.onWeightStep(-1) : undefined}
          onIncrement={interactive ? () => props.onWeightStep(1) : undefined}
          onEdit={interactive ? props.onEditWeight : undefined}
        />
      ) : (
        <div className="ds-stack">
          {firstTime ? null : (
            <div className="session-card__compare">
              <CompareTile
                label="Última vez"
                value={formatWeight(previous?.weightKg ?? 0)}
                unit="kg"
                caption={`${previous?.sets ?? 0} × ${previous?.reps ?? 0} · ${
                  formatEffort(previous?.effort ?? null) ?? 'sin esfuerzo'
                }`}
              />
              <CompareTile
                label="Peso de hoy"
                value={todayWeightKg === null ? '—' : formatWeight(todayWeightKg)}
                unit="kg"
                caption={setsAndWork(prescription, targetReps)}
                today
              />
            </div>
          )}
          {reason === null ? null : <p className="ds-body">{reason}</p>}
          {exercise.recommendation !== null && exercise.recommendation.basedOnSessions === 0 ? (
            <p className="ds-meta">La primera recomendación real llegará en la próxima sesión.</p>
          ) : null}
          <p className="ds-caption">{targetLine(prescription)}</p>
        </div>
      )}

      {showHistoryStrip ? (
        bars.length === 0 ? (
          <hr className="ds-hairline" />
        ) : (
          <>
            <hr className="ds-hairline" />
            <HistoryStrip bars={bars} sets={prescription.sets} />
            <hr className="ds-hairline" />
          </>
        )
      ) : null}

      <div className="session-card__sets">
        {slots.map((slot) => setRowFor(slot, entryAt(exercise, slot), props, targetReps, activeSlot, best))}
      </div>

      {interactive && activeSlot !== null ? (
        <TextButton onClick={props.onSkipRemaining}>Saltar el resto</TextButton>
      ) : null}

      {/* The busy-machine path (S4): a secondary action, never a second primary fill. */}
      {props.onSuggestAlternative === undefined ? null : (
        <TextButton onClick={props.onSuggestAlternative}>Sugerir otro ejercicio</TextButton>
      )}
    </Card>
  );
}

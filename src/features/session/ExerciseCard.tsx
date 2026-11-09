/**
 * One exercise card of the session sheet (§7.2): name, position, previous session,
 * the two compare tiles, the one-line reason, the last-six-sessions strip, the set rows
 * and the weight summary once the load is decided.
 *
 * The card is composed here rather than in `src/design-system`, exactly as that library
 * documents: the page container and its state machine belong to the screen. Everything
 * visual comes from a component or a token; the only numbers this file decides are the
 * bar heights of the strip, which are data.
 *
 * Read-only when it is not the card on screen: a card you swiped away from still shows
 * its sets, but nothing on it can be confirmed by accident.
 */

import type { Exercise, ExercisePrescription } from '../../core/domain';
import type { ExerciseState, SetEntry } from '../../core/session/model';
import { formatReason } from '../../core/engine/reasons';
import type { PlainRecommendation } from '../../core/session/model';
import {
  Card,
  Chip,
  CompareTile,
  SectionLabel,
  SetRow,
  TextButton,
  WeightSummary,
  type IconName,
  type SetState,
} from '../../design-system';
import type { HistoryPoint } from './controller';
import {
  formatDiscomfort,
  formatEffort,
  formatWeight,
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

export interface ExerciseCardProps {
  readonly exercise: ExerciseState;
  readonly detail: Exercise | undefined;
  readonly history: readonly HistoryPoint[];
  /** The weight of today: the decision, or the suggestion while none is made. */
  readonly todayWeightKg: number | null;
  readonly draft: SetDraft;
  /** This card is the one on screen and the session is still open. */
  readonly interactive: boolean;
  readonly onRepsChange: (reps: number) => void;
  readonly onEffortChange: (effort: EffortChip | null) => void;
  readonly onDiscomfortChange: (discomfort: DiscomfortChip | null) => void;
  readonly onShowDiscomfort: () => void;
  readonly onConfirm: () => void;
  readonly onEditWeight: () => void;
  readonly onSkipRemaining: () => void;
  readonly onWeightStep: (delta: number) => void;
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

function setRowFor(
  slot: number,
  entry: SetEntry | undefined,
  props: ExerciseCardProps,
  targetReps: number,
  activeSlot: number | null,
  best: number,
): React.ReactElement {
  if (entry !== undefined && entry.status === 'confirmed') {
    return (
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
      />
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
            onConfirm: props.onConfirm,
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
  const { exercise, detail, history, todayWeightKg, draft, interactive } = props;
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

  const slots: number[] = [];
  for (let slot = 1; slot <= prescription.sets; slot += 1) slots.push(slot);

  const title = (
    <div className="session-card__head">
      <h1 className="ds-card-title ds-card-title--large">{exercise.exerciseNameSnapshot}</h1>
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
                caption={`${prescription.sets} × ${targetReps}`}
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

      {bars.length === 0 ? (
        <hr className="ds-hairline" />
      ) : (
        <>
          <hr className="ds-hairline" />
          <HistoryStrip bars={bars} sets={prescription.sets} />
          <hr className="ds-hairline" />
        </>
      )}

      <div className="session-card__sets">
        {slots.map((slot) => setRowFor(slot, entryAt(exercise, slot), props, targetReps, activeSlot, best))}
      </div>

      {interactive && activeSlot !== null ? (
        <TextButton onClick={props.onSkipRemaining}>Saltar el resto</TextButton>
      ) : null}
    </Card>
  );
}

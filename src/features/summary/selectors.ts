/**
 * Resumen's decisions, without React.
 *
 * The screen exists to answer four questions about one finished session: how long it
 * took, how many sets happened out of what was prescribed, how much was moved, and
 * whether anything was a personal record. Every one of them is derived here from the
 * stored aggregate, because the store keeps no summary of its own (data-model §8,
 * I-6: nothing precomputed).
 *
 * The rule that shapes the file: **never claim more than the record supports**.
 *
 * - A duration needs `startedAt` and an end the store can prove; without them the cell
 *   is empty, not `0 min`.
 * - A record needs a previous mark to beat. First time at a rep count is a fact, not a
 *   record, so it stays out of the record list instead of inventing an "antes".
 * - An exercise with no confirmed set says so, and its volume is a zero that is
 *   labelled as one.
 */

import type { Exercise, ExerciseSession, SetRecord, WorkoutSession } from '../../storage';
import type { IconName } from '../../design-system';
import { formatVolume, formatWeight } from '../session/format';
import { formatDuration, formatEyebrowDate, formatShortDate } from '../home/format';
import {
  confirmedSetCount,
  prescribedSets,
  sameDay,
  sessionDurationMs,
  sessionVolumeKg,
} from '../home/selectors';

export interface SummaryInput {
  readonly session: WorkoutSession;
  /** The rest of the history, in any order. The session itself is ignored if present. */
  readonly history: readonly WorkoutSession[];
  /** The exercise library, for the row glyphs. The names come from the snapshots. */
  readonly library: readonly Exercise[];
  readonly now: number;
}

export interface SummaryTotalsView {
  /** `8/9` — confirmed out of prescribed. */
  readonly series: string;
  /** `52 min`, or `null` when the store cannot prove a duration. */
  readonly duration: string | null;
  /** `8.280` — grouped whole kilos; the unit is the component's business. */
  readonly volume: string;
}

export interface RecordView {
  readonly exerciseName: string;
  /** `Peso muerto · 92,5 kg × 10` */
  readonly line: string;
  /** `Mejor marca en 10 repeticiones. Antes: 90 kg.` */
  readonly detail: string;
  /** `hoy` or a short date: the design puts the day next to the chip. */
  readonly when: string;
}

export interface SummarySetView {
  /** `Serie 2` */
  readonly label: string;
  /** `10 × 92,5 kg` */
  readonly detail: string;
}

export interface SummaryExerciseView {
  readonly id: string;
  readonly name: string;
  readonly icon: IconName;
  /** `3 series · 92,5 kg`, `2 de 3 series`, `Sin series registradas`. */
  readonly subtitle: string;
  readonly volume: string;
  readonly sets: readonly SummarySetView[];
}

export interface SummaryView {
  readonly eyebrow: string;
  readonly title: string;
  readonly dayName: string;
  readonly totals: SummaryTotalsView;
  /** The partial explanation, or `null` on a completed session. */
  readonly note: string | null;
  readonly records: readonly RecordView[];
  readonly noRecords: string | null;
  readonly exercises: readonly SummaryExerciseView[];
  readonly status: 'completed' | 'partial';
}

const EQUIPMENT_ICON: Readonly<Record<Exercise['equipment'], IconName>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  band: 'band',
  bodyweight: 'train',
};

/** The library entry of an exercise session, by id first and by name as a fallback. */
function iconOf(exercise: ExerciseSession, library: readonly Exercise[]): IconName {
  const known =
    (exercise.exerciseId === null
      ? undefined
      : library.find((candidate) => candidate.id === exercise.exerciseId)) ??
    library.find((candidate) => candidate.name === exercise.exerciseNameSnapshot);
  return known === undefined ? 'dumbbell' : EQUIPMENT_ICON[known.equipment];
}

/**
 * The status the session should be closed with. A prescription with no exercises is not
 * a completed training session: it is the empty case, and `partial` says so.
 */
export function summaryOutcome(session: WorkoutSession): 'completed' | 'partial' {
  if (session.exercises.length === 0) return 'partial';
  for (const exercise of session.exercises) {
    if (exercise.sets.length !== exercise.prescription.sets) return 'partial';
  }
  return 'completed';
}

function topSetOf(exercise: ExerciseSession): SetRecord | null {
  let best: SetRecord | null = null;
  for (const set of exercise.sets) {
    if (
      best === null ||
      set.weightKg > best.weightKg ||
      (set.weightKg === best.weightKg && set.actualReps > best.actualReps)
    ) {
      best = set;
    }
  }
  return best;
}

function belongsTo(
  exercise: ExerciseSession,
  other: ExerciseSession,
): boolean {
  if (exercise.exerciseId !== null && other.exerciseId !== null) {
    return exercise.exerciseId === other.exerciseId;
  }
  return exercise.exerciseNameSnapshot === other.exerciseNameSnapshot;
}

/**
 * The best weight this exercise had already been moved for at the same rep count or
 * more. `null` means there is nothing to compare against, and a comparison without a
 * previous mark is not a record.
 */
function previousBest(
  exercise: ExerciseSession,
  top: SetRecord,
  history: readonly WorkoutSession[],
): number | null {
  let best: number | null = null;
  for (const session of history) {
    for (const other of session.exercises) {
      if (!belongsTo(exercise, other)) continue;
      for (const set of other.sets) {
        if (set.actualReps < top.actualReps) continue;
        if (best === null || set.weightKg > best) best = set.weightKg;
      }
    }
  }
  return best;
}

function recordOf(
  exercise: ExerciseSession,
  top: SetRecord,
  previous: number,
  now: number,
): RecordView {
  return {
    exerciseName: exercise.exerciseNameSnapshot,
    line: `${exercise.exerciseNameSnapshot} · ${formatWeight(top.weightKg)} kg × ${top.actualReps}`,
    detail: `Mejor marca en ${top.actualReps} repeticiones. Antes: ${formatWeight(previous)} kg.`,
    when: sameDay(top.confirmedAt, now) ? 'hoy' : formatShortDate(top.confirmedAt),
  };
}

function exerciseViewOf(exercise: ExerciseSession, library: readonly Exercise[]): SummaryExerciseView {
  const confirmed = exercise.sets.length;
  const prescribed = exercise.prescription.sets;
  const top = topSetOf(exercise);
  const subtitle =
    confirmed === 0 || top === null
      ? 'Sin series registradas'
      : confirmed < prescribed
        ? `${confirmed} de ${prescribed} series`
        : `${confirmed} series · ${formatWeight(top.weightKg)} kg`;

  return {
    id: exercise.id,
    name: exercise.exerciseNameSnapshot,
    icon: iconOf(exercise, library),
    subtitle,
    volume: formatVolume(
      exercise.sets.reduce((total, set) => total + set.weightKg * set.actualReps, 0),
    ),
    sets: exercise.sets.map((set) => ({
      label: `Serie ${set.index}`,
      detail: `${set.actualReps} × ${formatWeight(set.weightKg)} kg`,
    })),
  };
}

export function summaryViewOf(input: SummaryInput): SummaryView {
  const { session, library, now } = input;
  // The session under review is never its own history: comparing a set with itself
  // would make every session a record.
  const history = input.history.filter((candidate) => candidate.id !== session.id);

  const records: RecordView[] = [];
  for (const exercise of session.exercises) {
    const top = topSetOf(exercise);
    if (top === null) continue;
    const previous = previousBest(exercise, top, history);
    if (previous === null || top.weightKg <= previous) continue;
    records.push(recordOf(exercise, top, previous, now));
  }

  const duration = sessionDurationMs(session);
  const outcome = summaryOutcome(session);
  const partial = session.status !== 'completed';

  return {
    eyebrow: formatEyebrowDate(session.scheduledDate),
    title: outcome === 'completed' ? 'Sesión completada' : 'Sesión parcial',
    dayName: session.dayNameSnapshot,
    totals: {
      series: `${String(confirmedSetCount(session))}/${String(prescribedSets(session))}`,
      duration: duration === null ? null : formatDuration(duration),
      volume: formatVolume(sessionVolumeKg(session)),
    },
    note: partial
      ? 'Guardada como parcial. Puedes repetir el día cuando quieras; no cuenta como fallo.'
      : null,
    records,
    noRecords:
      records.length === 0 ? 'Sin récords hoy. No hace falta que cada sesión los tenga.' : null,
    exercises: session.exercises.map((exercise) => exerciseViewOf(exercise, library)),
    status: outcome,
  };
}

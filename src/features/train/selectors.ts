/**
 * Entrenar's decisions, without React.
 *
 * The screen is the weekday template plus the sessions it produced, and the two honesty
 * rules of the design ("a screen is not done until its states exist") decide every
 * branch:
 *
 * 1. **A weekday is only written when a session proves it.** `PlanDay` stores `order`
 *    and a name, not a day of the week, and no task in the app tier creates a scheduled
 *    session yet. A template day without a session therefore claims no weekday, and the
 *    row says `Pierna · 2 ejercicios` instead of inventing `Lunes`.
 * 2. **A state word is a fact.** `hecha` needs a closed session, `hoy` a session
 *    scheduled for the injected day, and everything else is `pendiente` — the three
 *    words the artboard draws, each one earned by the record.
 *
 * Nothing here reads a clock, a store or the DOM: `TrainInput` is the whole world of the
 * screen, which is why every state of the design's Entrenar row is one fixture away.
 */

import type { PhaseState, PlanDay, WorkoutSession } from '../../storage';
import { formatVolume, targetLine } from '../session/format';
import {
  dayFocus,
  formatDayName,
  formatDuration,
  formatExerciseCount,
  formatWeekdayName,
  formatWeekOf,
} from '../home/format';
import {
  READAPTATION_BLOCKS,
  sameDay,
  sessionDurationMs,
  sessionVolumeKg,
  startOfWeek,
} from '../home/selectors';

export interface TrainInput {
  readonly now: number;
  readonly plan: readonly PlanDay[];
  /** The stored sessions, in any order: only this week's are drawn. */
  readonly sessions: readonly WorkoutSession[];
  readonly phaseState: PhaseState | undefined;
}

export type TrainStatusWord = 'hecha' | 'hoy' | 'pendiente';
export type TrainStatusTone = 'success' | 'accent' | 'muted';

export interface TrainItemView {
  readonly name: string;
  /** `Objetivo · 3 × 8–10 a 2–3 RIR · descanso 180 s` — the house prescription line. */
  readonly prescription: string;
}

export interface TrainDayView {
  readonly planDayId: string;
  /** `Sentadilla / Pierna` — the snapshotted name, written the way the artboard does. */
  readonly title: string;
  /** `Lunes · Pierna · 8.280 kg · 52 min` */
  readonly subtitle: string;
  readonly status: { readonly word: TrainStatusWord; readonly tone: TrainStatusTone };
  /** The session behind the row, when one exists: the only thing worth opening. */
  readonly sessionId: string | null;
  readonly items: readonly TrainItemView[];
}

export type TrainToday =
  | { readonly kind: 'session'; readonly title: string; readonly sessionId: string }
  | { readonly kind: 'rest' };

export interface TrainPhaseView {
  /** `Bloque de readaptación` */
  readonly label: string;
  /** `semana 2 de 4` */
  readonly chip: string;
  readonly note: string;
}

export interface TrainView {
  /** `Semana del 6 de noviembre` */
  readonly weekLabel: string;
  readonly days: readonly TrainDayView[];
  readonly planEmpty: boolean;
  readonly today: TrainToday | null;
  readonly phase: TrainPhaseView | null;
}

const PHASE_NOTE =
  'Se avanza al siguiente bloque cuando se cumplen los cuatro criterios de la semana.';

function sessionsThisWeek(sessions: readonly WorkoutSession[], now: number): readonly WorkoutSession[] {
  const from = startOfWeek(now);
  const until = new Date(from);
  until.setDate(until.getDate() + 7);
  const end = until.getTime();
  return sessions.filter(
    (session) => session.scheduledDate >= from && session.scheduledDate < end,
  );
}

function sessionOfDay(
  sessions: readonly WorkoutSession[],
  planDayId: string,
): WorkoutSession | undefined {
  let best: WorkoutSession | undefined;
  for (const session of sessions) {
    if (session.planDayId !== planDayId) continue;
    if (best === undefined || session.scheduledDate > best.scheduledDate) best = session;
  }
  return best;
}

function statusOf(session: WorkoutSession | undefined, now: number): { word: TrainStatusWord; tone: TrainStatusTone } {
  if (session === undefined) return { word: 'pendiente', tone: 'muted' };
  if (session.status === 'completed' || session.status === 'partial') {
    return { word: 'hecha', tone: 'success' };
  }
  if (sameDay(session.scheduledDate, now)) return { word: 'hoy', tone: 'accent' };
  return { word: 'pendiente', tone: 'muted' };
}

function subtitleOf(
  day: PlanDay,
  session: WorkoutSession | undefined,
): string {
  const parts: string[] = [];
  if (session !== undefined) parts.push(formatWeekdayName(session.scheduledDate));
  const focus = dayFocus(day.name);
  if (focus !== null) parts.push(focus);

  if (session !== undefined && (session.status === 'completed' || session.status === 'partial')) {
    const duration = sessionDurationMs(session);
    const volume = formatVolume(sessionVolumeKg(session));
    parts.push(duration === null ? `${volume} kg` : `${volume} kg · ${formatDuration(duration)}`);
    return parts.join(' · ');
  }

  // What is still to do is the template's exercise count, as the artboard draws it. The
  // duration forecast belongs to Inicio's today card, not to this list.
  parts.push(formatExerciseCount(day.items.length));
  return parts.join(' · ');
}

export function trainViewOf(input: TrainInput): TrainView {
  const { now, plan, phaseState } = input;
  const week = sessionsThisWeek(input.sessions, now);
  const ordered = [...plan].sort((left, right) => left.order - right.order);

  const days: TrainDayView[] = ordered.map((day) => {
    const session = sessionOfDay(week, day.id);
    return {
      planDayId: day.id,
      title: formatDayName(day.name),
      subtitle: subtitleOf(day, session),
      status: statusOf(session, now),
      sessionId: session === undefined ? null : session.id,
      items: day.items
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          name: item.exerciseNameSnapshot,
          prescription: targetLine(item.prescription),
        })),
    };
  });

  const todaySession = week.find((session) => sameDay(session.scheduledDate, now));
  const today: TrainToday | null =
    ordered.length === 0
      ? null
      : todaySession === undefined
        ? { kind: 'rest' }
        : {
            kind: 'session',
            title: formatDayName(todaySession.dayNameSnapshot),
            sessionId: todaySession.id,
          };

  return {
    weekLabel: formatWeekOf(now),
    days,
    planEmpty: ordered.length === 0,
    today,
    phase:
      phaseState === undefined
        ? null
        : {
            label: 'Bloque de readaptación',
            chip: `semana ${String(Math.min(Math.max(Math.trunc(phaseState.block), 1), READAPTATION_BLOCKS))} de ${String(READAPTATION_BLOCKS)}`,
            note: PHASE_NOTE,
          },
  };
}

export { dayFocus, formatDayName };

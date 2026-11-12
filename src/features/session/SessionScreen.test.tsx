/**
 * The fast path of the session sheet: one answer per exercise (S4, S8, T6).
 *
 * Two things are pinned here, both through what the owner sees and what the store
 * actually receives: the row of answers as markup — including the line it shows when
 * there is no load to write yet (S3: the load is chosen first, never guessed) — and the
 * tap itself, followed down the ordinary confirmation path, so the sets land as
 * `set-confirmed` rows in order and a set confirmed by hand keeps its own numbers.
 *
 * The project has no DOM environment (see `HomeScreen.test.tsx`), so the row is drawn
 * with `renderToStaticMarkup` and the tap goes through the same exported seam the screen
 * wires to the buttons.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EFFORT, type ExercisePrescription } from '../../core/domain';
import type { ExerciseState } from '../../core/session/model';
import type { SetRecord, WorkoutSession } from '../../storage';
import { VerdictRow, writeVerdict } from './SessionScreen';
import { createSessionMachine, type SessionMachine } from './controller';
import { createFakeStorage } from './fake-port';
import { DEMO_NOW, EXERCISES } from './fixture';

const NOW = DEMO_NOW;

/** `3 × 6–8` at 2–3 RIR, suggested at 60 kg: the card the answers belong to. */
const PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 6, upperBound: 8 },
  targetRIR: { lowerBound: 2, upperBound: 3 },
  restSeconds: 180,
};

function storedSet(slot: number, weightKg: number, reps: number): SetRecord {
  return {
    id: `xs-1:${slot}`,
    index: slot,
    weightKg,
    targetReps: reps,
    actualReps: reps,
    effort: EFFORT.correct,
    discomfort: null,
    confirmedAt: NOW - 120_000,
  };
}

/**
 * The day's session with one card: `PRESCRIPTION` suggested at 60 kg. `sets` is what the
 * owner confirmed by hand before answering the verdict.
 */
function sessionWith(sets: readonly SetRecord[]): WorkoutSession {
  const decided = sets.length > 0;
  return {
    id: 'session-verdict',
    planDayId: 'plan-day-miercoles',
    dayNameSnapshot: 'MIÉRCOLES / CUERPO COMPLETO',
    scheduledDate: NOW - 30 * 60_000,
    startedAt: decided ? NOW - 300_000 : null,
    endedAt: null,
    phase: { kind: 'readaptation', week: 2 },
    status: decided ? 'inProgress' : 'scheduled',
    exercises: [
      {
        id: 'xs-1',
        order: 1,
        exerciseId: 'ex-peso-muerto',
        exerciseNameSnapshot: 'Peso muerto',
        prescription: PRESCRIPTION,
        recommendation: {
          suggestedWeightKg: 60,
          suggestedSets: PRESCRIPTION.sets,
          suggestedTargetReps: PRESCRIPTION.repRange.lowerBound,
          action: 'hold',
          reason: 'addRepetition',
          confidence: { level: 'medium', sessionsConsidered: 3 },
          basedOnSessions: 3,
          computedAt: new Date(NOW - 86_400_000),
          reasonContext: { kg: 60, nextReps: 7 },
        },
        decision: decided ? { kind: 'accepted' } : null,
        recommendedWeightKg: decided ? 60 : null,
        usedWeightKg: decided ? 60 : null,
        loadDeltaKg: decided ? 0 : null,
        sets: [...sets],
        status: 'active',
        completedAt: null,
      },
    ],
  };
}

interface Booted {
  readonly machine: SessionMachine;
  readonly exercise: ExerciseState;
}

async function booted(sets: readonly SetRecord[] = []): Promise<Booted> {
  const storage = createFakeStorage({
    sessions: [sessionWith(sets)],
    exercises: [...EXERCISES],
  });
  const machine = createSessionMachine({ storage, clock: { now: () => NOW } });
  const runtime = await machine.boot();
  const exercise = runtime.session?.exercises[0];
  if (exercise === undefined) throw new Error('the machine booted without a session card');
  return { machine, exercise };
}

describe('the row of answers', () => {
  it('renders the three answers of an exercise with a load', async () => {
    const { exercise } = await booted();

    const markup = renderToStaticMarkup(
      <VerdictRow exercise={exercise} onVerdict={() => undefined} />,
    );

    expect(markup).toContain('Lo hice');
    expect(markup).toContain('Fallé');
    expect(markup).toContain('Fui sobrado');
  });

  it('asks for the load first when there is none suggested', async () => {
    const { exercise } = await booted();
    const withoutLoad: ExerciseState = {
      ...exercise,
      recommendation: null,
      recommendedWeightKg: null,
      usedWeightKg: null,
    };

    const markup = renderToStaticMarkup(
      <VerdictRow exercise={withoutLoad} onVerdict={() => undefined} />,
    );

    expect(markup).toContain('Elige');
    expect(markup).toContain('peso');
    expect(markup).not.toContain('Lo hice');
  });

  it('offers only lo hice and fallé on a slot prescribed by time', async () => {
    const { exercise } = await booted();
    const timed: ExerciseState = {
      ...exercise,
      prescription: {
        ...PRESCRIPTION,
        repRange: { lowerBound: 1, upperBound: 1 },
        durationSeconds: 120,
      },
    };

    const markup = renderToStaticMarkup(
      <VerdictRow exercise={timed} onVerdict={() => undefined} />,
    );

    expect(markup).toContain('Lo hice');
    expect(markup).toContain('Fallé');
    expect(markup).not.toContain('Fui sobrado');
  });
});

describe('one tap', () => {
  it('writes the prescribed number of sets through the confirmation path', async () => {
    const { machine, exercise } = await booted();
    const confirmed: string[] = [];

    await writeVerdict(
      async (event) => {
        confirmed.push(event.type);
        return machine.dispatch(event, NOW);
      },
      exercise,
      'done',
    );

    // Every set is written by the confirmation the sheet already uses, in order.
    expect(confirmed).toEqual(['set-confirmed', 'set-confirmed', 'set-confirmed']);

    const written = machine.runtime().session?.exercises[0]?.sets ?? [];
    expect(written).toHaveLength(PRESCRIPTION.sets);
    expect(written.map((entry) => (entry.status === 'confirmed' ? entry.set.actualReps : null))).toEqual(
      [6, 6, 6],
    );
    expect(written.map((entry) => (entry.status === 'confirmed' ? entry.set.weightKg : null))).toEqual([
      60, 60, 60,
    ]);
  });

  it('never rewrites a set that was already confirmed', async () => {
    const byHand = storedSet(1, 55, 4);
    const { machine, exercise } = await booted([byHand]);

    await writeVerdict((event) => machine.dispatch(event, NOW), exercise, 'done');

    const written = machine.runtime().session?.exercises[0]?.sets ?? [];
    expect(written).toHaveLength(PRESCRIPTION.sets);
    const first = written[0];
    if (first === undefined || first.status !== 'confirmed') throw new Error('the first set was lost');
    // The owner's own first set survives the verdict: same weight, same reps.
    expect(first.set.weightKg).toBe(55);
    expect(first.set.actualReps).toBe(4);
    // What was left is the verdict's: the bottom of the range at the suggested load.
    const rest = written.slice(1).map((entry) => (entry.status === 'confirmed' ? entry.set : null));
    expect(rest.map((set) => set?.weightKg)).toEqual([60, 60]);
    expect(rest.map((set) => set?.actualReps)).toEqual([6, 6]);
  });

  it('writes nothing once the exercise is closed', async () => {
    const { machine, exercise } = await booted();
    await writeVerdict((event) => machine.dispatch(event, NOW), exercise, 'done');

    const settled = machine.runtime().session?.exercises[0];
    if (settled === undefined) throw new Error('the session lost its card');
    let calls = 0;
    await writeVerdict(
      async (event) => {
        calls += 1;
        return machine.dispatch(event, NOW);
      },
      settled,
      'done',
    );

    expect(calls).toBe(0);
  });
});

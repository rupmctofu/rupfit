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
import type { ExerciseState, SessionEvent, SessionState } from '../../core/session/model';
import type { SetRecord, WorkoutSession } from '../../storage';
import { CorrectionHint, VerdictRow, writeCorrection, writeVerdict } from './SessionScreen';
import { ExerciseCard } from './ExerciseCard';
import { createSessionMachine, type SessionMachine } from './controller';
import { createFakeStorage, type FakeStorage } from './fake-port';
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
  readonly storage: FakeStorage;
  readonly session: SessionState;
  readonly exercise: ExerciseState;
}

async function booted(sets: readonly SetRecord[] = []): Promise<Booted> {
  const storage = createFakeStorage({
    sessions: [sessionWith(sets)],
    exercises: [...EXERCISES],
  });
  const machine = createSessionMachine({ storage, clock: { now: () => NOW } });
  const runtime = await machine.boot();
  const session = runtime.session;
  const exercise = session?.exercises[0];
  if (session === null || exercise === undefined) {
    throw new Error('the machine booted without a session card');
  }
  return { machine, storage, session, exercise };
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

/* ------------------------------------------------- correcting a confirmed set (T2/T3) */

function countButtons(markup: string): number {
  return markup.match(/<button/g)?.length ?? 0;
}

describe('the correction the sheet offers (S2, S4)', () => {
  it('teaches the gesture in one line, and the line is not a control', () => {
    // RED: a hint that carried a button would be the per-row control S2 refuses.
    const markup = renderToStaticMarkup(<CorrectionHint />);

    expect(markup).toContain('Mantén una serie para corregirla');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('ds-action');
  });

  it('makes a confirmed row reachable and announces both ways in, adding no control', async () => {
    const { exercise } = await booted([storedSet(1, 55, 4)]);

    const card = (onCorrectSet: boolean): string =>
      renderToStaticMarkup(
        <ExerciseCard
          exercise={exercise}
          detail={undefined}
          history={[]}
          todayWeightKg={60}
          draft={{ weightKg: 60, reps: 6, effort: null, discomfort: null, showDiscomfort: false }}
          interactive
          heroShown
          onRepsChange={() => undefined}
          onEffortChange={() => undefined}
          onDiscomfortChange={() => undefined}
          onShowDiscomfort={() => undefined}
          onEditWeight={() => undefined}
          onSkipRemaining={() => undefined}
          onWeightStep={() => undefined}
          {...(onCorrectSet ? { onCorrectSet: () => undefined } : {})}
        />,
      );

    const holdable = card(true);
    const plain = card(false);

    // S2: the hold is announced, and so is its keyboard equivalent — a 500 ms press is
    // unreachable with VoiceOver and on a desktop, and the row must not lie about it.
    expect(holdable).toContain('mantén pulsada o pulsa Intro para corregirla');
    expect(holdable).toContain('ds-set--holdable');
    // Reachable: the row itself takes focus, with the design system's focus ring class.
    expect(holdable).toContain('tabindex="0"');
    expect(holdable).toContain('ds-focusable');
    // S2: the activation adds no control — same number of buttons, same actions.
    expect(countButtons(holdable)).toBe(countButtons(plain));
    // And a row that cannot be corrected is neither focusable nor announced as such.
    expect(plain).not.toContain('mantén pulsada');
    expect(plain).not.toContain('tabindex="0"');
    expect(plain).not.toContain('ds-set--holdable');
  });

  it('opens the corrected set in its own place, with the answers it had', async () => {
    const { exercise } = await booted([storedSet(1, 55, 4), storedSet(2, 60, 6)]);

    const markup = renderToStaticMarkup(
      <ExerciseCard
        exercise={exercise}
        detail={undefined}
        history={[]}
        todayWeightKg={60}
        draft={{ weightKg: 60, reps: 6, effort: null, discomfort: null, showDiscomfort: false }}
        interactive={false}
        heroShown
        editing={{
          slot: 1,
          draft: {
            weightKg: 62.5,
            reps: 7,
            effort: 'fácil',
            discomfort: 'molestia',
            showDiscomfort: true,
          },
          onRepsChange: () => undefined,
          onEffortChange: () => undefined,
          onDiscomfortChange: () => undefined,
          onShowDiscomfort: () => undefined,
          onEditWeight: () => undefined,
        }}
        onRepsChange={() => undefined}
        onEffortChange={() => undefined}
        onDiscomfortChange={() => undefined}
        onShowDiscomfort={() => undefined}
        onEditWeight={() => undefined}
        onSkipRemaining={() => undefined}
        onWeightStep={() => undefined}
      />,
    );

    // In place: the editor is the row, it keeps `Serie 1`, and the neighbours stay put.
    expect(markup).toContain('Corrigiendo la serie 1');
    expect(markup).toContain('62,5 kg');
    expect(markup).toContain('fácil');
    expect(markup).toContain('molestia');
    expect(markup.indexOf('Serie 2')).toBeGreaterThan(markup.indexOf('Corrigiendo la serie 1'));
    // The pad is the screen's, and the sheet shows exactly one of them: the editor row
    // carries no keypad of its own.
    expect(markup).not.toContain('ds-keypad');
    // And the row it replaced no longer announces itself as a completed set.
    expect(markup).not.toContain('Serie 1, completada');
  });
});

describe('saving a correction (S6)', () => {
  it('writes once, through the writer the sheet already uses', async () => {
    const { machine, storage, session } = await booted([storedSet(1, 55, 4), storedSet(2, 55, 4)]);
    storage.reset();

    const sent: SessionEvent[] = [];
    const result = await writeCorrection(
      async (event) => {
        sent.push(event);
        return machine.dispatch(event, NOW);
      },
      session,
      'xs-1',
      1,
      { weightKg: 60, actualReps: 6, effort: EFFORT.easy, discomfort: null },
    );

    expect(result).toEqual({ written: true, refusal: null });
    // One event, one set, one write: the sheet's own `confirmSet` port method.
    expect(sent).toEqual([
      {
        type: 'set-corrected',
        exerciseSessionId: 'xs-1',
        slot: 1,
        weightKg: 60,
        actualReps: 6,
        effort: EFFORT.easy,
        discomfort: null,
      },
    ]);
    expect(storage.calls).toEqual(['sessions.confirmSet']);
  });

  /*
   * S3/S6 persistence, at the screen's own writer: the corrected row is what the store
   * holds afterwards, on the same slot, with the same index and the same number of rows.
   *
   * This was `it.fails` until `sessions.confirmSet` learned to rewrite a stored slot
   * (`src/storage/repositories/sessions.ts`); the flip is the acceptance check for that
   * change, and the storage-side rules are pinned in
   * `src/storage/repositories/sessions.test.ts`.
   */
  it('stores the corrected set, on its own slot', async () => {
      const { machine, storage, session } = await booted([storedSet(1, 55, 4), storedSet(2, 55, 4)]);
      storage.reset();

      const result = await writeCorrection(
        (event) => machine.dispatch(event, NOW),
        session,
        'xs-1',
        1,
        { weightKg: 60, actualReps: 6, effort: EFFORT.easy, discomfort: null },
      );
      expect(result.refusal).toBe(null);

      // The row the owner sees is the corrected one, on the same slot and the same index.
      const first = machine.runtime().session?.exercises[0]?.sets[0];
      expect(first?.status).toBe('confirmed');
      if (first === undefined || first.status !== 'confirmed') throw new Error('the set is gone');
      expect(first.set.weightKg).toBe(60);
      expect(first.set.actualReps).toBe(6);
      expect(first.set.index).toBe(1);
      // And the store holds it: one row per slot, rewritten in place.
      expect(storage.stored()[0]?.exercises[0]?.sets[0]?.weightKg).toBe(60);
    expect(storage.stored()[0]?.exercises[0]?.sets).toHaveLength(2);
  });

  it('writes nothing at all when the rule refuses the correction', async () => {
    const { machine, storage, session } = await booted([storedSet(1, 55, 4)]);
    storage.reset();

    const sent: SessionEvent[] = [];
    // Slot 2 is prescribed but unanswered: there is no set to correct.
    const result = await writeCorrection(
      async (event) => {
        sent.push(event);
        return machine.dispatch(event, NOW);
      },
      session,
      'xs-1',
      2,
      { weightKg: 60, actualReps: 6, effort: null, discomfort: null },
    );

    expect(result.written).toBe(false);
    expect(result.refusal).toBe('Esa serie todavía no está registrada.');
    expect(sent).toEqual([]);
    expect(storage.calls).toEqual([]);
  });
});

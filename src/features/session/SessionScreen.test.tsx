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
import { summarise } from '../../core/session/model';
import type { ExerciseState, SessionEvent, SessionState } from '../../core/session/model';
import type { SetRecord, WorkoutSession } from '../../storage';
import {
  canFinishSession,
  CorrectionHint,
  EXIT_CONTROL_LABEL,
  EXIT_FINISH_LABEL,
  EXIT_LEAVE_LABEL,
  exitActionsFor,
  exitOffer,
  finishEvent,
  finishStepFor,
  SessionExit,
  VerdictRow,
  writeCorrection,
  writeVerdict,
  type SessionExitProps,
} from './SessionScreen';
// The project has no DOM to mount the screen in, and the bottom bar is markup the screen
// builds for itself: S6 is checked where it is written, the way `tests/accent-budget.test.ts`
// checks the stylesheets. `?raw` is the toolchain's own reader and needs no dependency.
import screenSource from './SessionScreen.tsx?raw';
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

/* ------------------------------------------------------------- the way out (T1) */

/** The exit control and its sheet, with everything closed: each test opens what it needs. */
const SHEET: SessionExitProps = {
  open: false,
  step: 'actions',
  canFinish: true,
  setsConfirmed: 0,
  onOpen: () => undefined,
  onClose: () => undefined,
  onLeave: () => undefined,
  onFinish: () => undefined,
  onConfirm: () => undefined,
};

describe('the exit control (S2, S3)', () => {
  it('is one named control that says it opens something, and draws no sheet until it opens', () => {
    // RED (T1): the top bar held a control named `Salir de la sesión` that left without
    // asking, and no sheet at all — there was no second thing to say.
    const markup = renderToStaticMarkup(<SessionExit {...SHEET} />);

    expect(markup).toContain('session__exit');
    expect(markup).toContain(`aria-label="${EXIT_CONTROL_LABEL}"`);
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
    // Nothing is drawn over the session until the owner asks for it.
    expect(markup).not.toContain('role="dialog"');
  });

  it('offers both named actions in the undecided session, in the sheet the day sheet uses', () => {
    // RED (T1): `Terminar la sesión` only existed in the bottom bar's non-decision
    // branches, so this state — no decision, not a single set — had no visible way out.
    return booted().then(({ session }) => {
      expect(session.exercises[0]?.decision).toBe(null);
      const offer = exitOffer(canFinishSession(session));

      // Two actions, both named, in the words the app already uses.
      expect(offer.map((action) => action.label)).toEqual([
        'Salir y seguir luego',
        'Terminar la sesión',
      ]);
      expect(EXIT_LEAVE_LABEL).toBe('Salir y seguir luego');
      expect(EXIT_FINISH_LABEL).toBe('Terminar la sesión');

      const markup = renderToStaticMarkup(<SessionExit {...SHEET} open />);

      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      // The day sheet's own contract: focus moves into the sheet when it opens.
      expect(markup).toContain('tabindex="-1"');
      expect(markup).toContain('Salir y seguir luego');
      expect(markup).toContain('Terminar la sesión');
    });
  });

  it('keeps the close in the sheet in every state, and drops it when there is nothing to close', () => {
    // S2: reachable with no sets (above), mid-exercise, and after the walk at the end.
    expect(canFinishSession(null)).toBe(false);
    const offers = (canFinish: boolean): readonly string[] =>
      exitOffer(canFinish).map((action) => action.label);

    expect(offers(true)).toEqual(['Salir y seguir luego', 'Terminar la sesión']);
    // A settled session has nothing left to close; the way out is still there.
    expect(offers(false)).toEqual(['Salir y seguir luego']);

    // And the sheet draws exactly what it offers: no close row on the settled screen.
    const settledMarkup = renderToStaticMarkup(
      <SessionExit {...SHEET} open canFinish={false} />,
    );
    expect(settledMarkup).toContain('Salir y seguir luego');
    expect(settledMarkup).not.toContain('Terminar la sesión');
    // And the line above them does not promise a close it no longer offers.
    expect(settledMarkup).not.toContain('cerrarla con lo que lleves');
    expect(settledMarkup).toContain('ya está cerrada');
  });
});

describe('salir y seguir luego (S3)', () => {
  it('leaves the session open, resumable, and writes nothing at all', async () => {
    // RED (T1): the exit ran the host's callback straight from the top bar. It still does
    // — but now through the named action, and the test says the session survives it.
    const { machine, storage, session } = await booted([storedSet(1, 55, 4)]);
    storage.reset();
    let left = 0;

    exitActionsFor({
      session,
      dispatch: (event) => machine.dispatch(event, NOW),
      onExit: () => {
        left += 1;
      },
    }).leave();

    expect(left).toBe(1);
    // Nothing was written and nothing was dispatched: the session is where it was.
    expect(storage.calls).toEqual([]);
    expect(machine.runtime().session?.status).toBe('inProgress');
    // Resumable: the stored row is still open, so `sessions.inProgress()` finds it.
    expect(storage.stored()[0]?.status).toBe('inProgress');
    expect(storage.stored()[0]?.endedAt).toBe(null);
    expect(machine.runtime().rejection).toBe(null);
  });
});

describe('terminar la sesión (S4)', () => {
  it('writes what was confirmed, then closes with the outcome the table derives', async () => {
    // RED (T1): the close lived in a bottom bar branch, so nothing could reach it in the
    // undecided state; and there was no seam proving what a close writes.
    const { machine, storage, session } = await booted([storedSet(1, 55, 4), storedSet(2, 60, 6)]);
    storage.reset();

    // The event is the table's own, with the outcome read from what the session answered.
    expect(finishEvent(session)).toEqual({ type: 'session-finished', outcome: 'partial' });

    await exitActionsFor({
      session,
      dispatch: (event) => machine.dispatch(event, NOW),
      onExit: () => undefined,
    }).finish();

    // One close, and no invented set: the two confirmed rows are exactly what was there.
    expect(storage.calls.filter((call) => call === 'sessions.finish')).toHaveLength(1);
    expect(storage.calls).not.toContain('sessions.confirmSet');

    const stored = storage.stored()[0];
    expect(stored?.status).toBe('partial');
    expect(stored?.endedAt).toBe(NOW);
    expect(stored?.exercises[0]?.sets.map((set) => set.weightKg)).toEqual([55, 60]);

    const settled = machine.runtime().session;
    if (settled === null) throw new Error('the close lost the session');
    expect(settled.status).toBe('partial');
    const total = summarise(settled);
    expect(total.setsConfirmed).toBe(2);
    expect(total.volumeKg).toBe(55 * 4 + 60 * 6);
    expect(total.setsConfirmed).toBe(2);
  });

  it('closes a session with no sets without inventing one, and reports what the table does', async () => {
    // The measured answer of the transition table, not a new rule (S4): a session with no
    // confirmed set is `scheduled`, and `session-finished` is refused from there with
    // `notStarted`. Nothing is written; the screen shows the table's own sentence.
    const { machine, storage, session } = await booted();
    storage.reset();

    await exitActionsFor({
      session,
      dispatch: (event) => machine.dispatch(event, NOW),
      onExit: () => undefined,
    }).finish();

    expect(storage.calls).toEqual([]);
    const runtime = machine.runtime();
    expect(runtime.session?.status).toBe('scheduled');
    expect(runtime.session?.exercises[0]?.sets).toEqual([]);
    expect(runtime.session?.exercises[0]?.decision).toBe(null);
    expect(runtime.rejection).toBe('La sesión no se ha empezado: no hay ninguna serie confirmada.');
  });
});

describe('the question before closing (S5)', () => {
  it('asks once with work logged, and closes on a single tap with nothing logged', async () => {
    // RED (T1): with sets confirmed the sheet asked nothing; with nothing logged the
    // bottom bar still offered no close at all.
    const empty = await booted();
    const withWork = await booted([storedSet(1, 55, 4)]);

    expect(finishStepFor(empty.session)).toBe('close');
    expect(finishStepFor(withWork.session)).toBe('confirm');

    const markup = renderToStaticMarkup(
      <SessionExit {...SHEET} open step="confirm" setsConfirmed={1} />,
    );

    // One dialog, not a modal over a modal: the question is inside the sheet.
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup).toContain('¿Terminar la sesión?');
    expect(markup).toContain('1 serie');
    expect(markup).toContain('Terminar la sesión');
    // And a way to change his mind, in the words the app already uses.
    expect(markup).toContain('Cancelar');

    // The question counts what is at stake, in the owner's words: one set, then several.
    const plural = renderToStaticMarkup(
      <SessionExit {...SHEET} open step="confirm" setsConfirmed={3} />,
    );
    expect(plural).toContain('3 series');
  });
});

describe('the bottom bar keeps its single job (S6)', () => {
  /** The bar's own block: from its declaration to the end of the function that fills it. */
  function bottomBarSource(source: string): string {
    const start = source.indexOf('const bottomBar = ((): React.ReactElement => {');
    const end = source.indexOf('  })();', start);
    if (start < 0 || end < 0) {
      throw new Error('the bottom bar moved: this probe can no longer read it');
    }
    return source.slice(start, end);
  }

  it('holds no way to finish the session, and no second row under its action', () => {
    const bar = bottomBarSource(screenSource);

    // The probe is reading the real bar, not an empty string.
    expect(bar).toContain('Registrar serie');
    // S6: closing the session lives in the exit sheet and nowhere else. The recovery
    // branch's `Descartar y guardar parcial` is not this: it dismisses the resume banner.
    expect(bar).not.toContain('Terminar la sesión');
    expect(bar).not.toContain('EXIT_FINISH_LABEL');
    // And nothing is stacked under the bar's one action any more.
    expect(bar).not.toContain('session__actions--stack');
  });
});

/**
 * The session controller: the reducer plus the port calls it owes, in order.
 *
 * Every test here reads the recorded port calls of the in-memory fake
 * (`fake-port.ts`) instead of asserting on its internals, because the contract the
 * screen depends on is *which writes happen, and in which order*. A rejected event
 * makes none; a failed write leaves the set unconfirmed and says so.
 */

import { describe, expect, it } from 'vitest';
import { EFFORT } from '../../core/domain';
import { isSessionAnswered, remainingSets, type SessionState } from '../../core/session/model';
import {
  createSessionMachine,
  screenStateOf,
  sessionSourceFrom,
  type Clock,
  type SessionJournal,
  type SessionMachine,
  type SessionRuntime,
} from './controller';
import { createFakeStorage, type FakeStorage } from './fake-port';
import {
  BARBELL_ROW,
  currentSession,
  DEADLIFT,
  DEMO_NOW,
  pastSessions,
  PROFILE,
  RDL,
  sessionFixture,
} from './fixture';

const NOW = DEMO_NOW;

function clockAt(now: number): Clock {
  return { now: () => now };
}

interface JournalSpy extends SessionJournal {
  readonly writes: readonly SessionState[];
  readonly clears: number;
  peek(): SessionState | null;
}

function journalSpy(initial: SessionState | null = null): JournalSpy {
  let current: SessionState | null = initial;
  const writes: SessionState[] = [];
  let clears = 0;
  return {
    read: () => current,
    write: (state) => {
      current = state;
      writes.push(state);
    },
    clear: () => {
      current = null;
      clears += 1;
    },
    get writes() {
      return [...writes];
    },
    get clears() {
      return clears;
    },
    peek: () => current,
  };
}

function machineOf(
  options: { readonly storage?: FakeStorage; readonly journal?: SessionJournal } = {},
): { machine: SessionMachine; storage: FakeStorage } {
  const storage = options.storage ?? createFakeStorage({ ...sessionFixture(NOW) });
  const machine = createSessionMachine({
    storage,
    clock: clockAt(NOW),
    journal: options.journal ?? journalSpy(),
  });
  return { machine, storage };
}

async function booted(
  options: { readonly storage?: FakeStorage; readonly journal?: SessionJournal } = {},
): Promise<{ machine: SessionMachine; storage: FakeStorage; runtime: SessionRuntime }> {
  const { machine, storage } = machineOf(options);
  const runtime = await machine.boot();
  storage.reset();
  return { machine, storage, runtime };
}

const ACTIVE_EXERCISE_ID = 'xs-1';

function activeSession(runtime: SessionRuntime): SessionState {
  if (runtime.session === null) throw new Error('the machine has no session');
  return runtime.session;
}

function answers(slot: number, weightKg = 92.5): {
  readonly exerciseSessionId: string;
  readonly slot: number;
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: typeof EFFORT.correct;
  readonly discomfort: null;
} {
  return {
    exerciseSessionId: ACTIVE_EXERCISE_ID,
    slot,
    weightKg,
    actualReps: 10,
    effort: EFFORT.correct,
    discomfort: null,
  };
}

describe('boot', () => {
  it('rebuilds an in-progress session from storage when the page was discarded', async () => {
    const { runtime, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 2, decision: { kind: 'accepted' } }),
      }),
    });

    expect(runtime.phase).toBe('ready');
    expect(runtime.recovery).toBe('recovered');
    expect(activeSession(runtime).status).toBe('inProgress');
    expect(activeSession(runtime).exercises[0]?.sets).toHaveLength(2);
    // The history read happens once, at boot, and feeds the strip and «última vez».
    expect(storage.calls).toEqual([]);
  });

  it('reads the session, then the history, then the library', async () => {
    const storage = createFakeStorage({ ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }) });
    const machine = createSessionMachine({ storage, clock: clockAt(NOW), journal: journalSpy() });

    await machine.boot();

    expect(storage.calls).toEqual([
      'sessions.inProgress',
      'sessions.recent',
      'exercises.byId',
      'exercises.byId',
      'exercises.byId',
      'exercises.byId',
      'exercises.byId',
      'exercises.byId',
      // S4/T5: the declared equipment, so «Sugerir otro ejercicio» only offers what the
      // owner can actually use. One read, and only the profile's `availableEquipment`.
      'profile.read',
    ]);
  });

  it('prefers the journal of the same session: a set skipped before the kill survives', async () => {
    const storage = createFakeStorage({
      ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
    });
    const probe = createSessionMachine({ storage, clock: clockAt(NOW), journal: journalSpy() });
    const first = await probe.boot();
    const withSkip = await probe.dispatch(
      { type: 'set-skipped', exerciseSessionId: ACTIVE_EXERCISE_ID, slot: 2 },
      NOW,
    );
    expect(activeSession(withSkip).exercises[0]?.sets).toHaveLength(2);
    expect(first.recovery).toBe('recovered');

    const journal = journalSpy(withSkip.session);
    const { runtime } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
      journal,
    });

    expect(runtime.recovery).toBe('resumed');
    expect(activeSession(runtime).exercises[0]?.sets.map((entry) => entry.status)).toEqual([
      'confirmed',
      'skipped',
    ]);
  });

  it('opens the next scheduled session without a resume banner', async () => {
    const { runtime } = await booted();
    expect(runtime.phase).toBe('ready');
    expect(runtime.recovery).toBe('none');
    expect(activeSession(runtime).status).toBe('scheduled');
  });

  it('reports an empty day when nothing is stored, reading nothing else', async () => {
    const storage = createFakeStorage({});
    const machine = createSessionMachine({ storage, clock: clockAt(NOW), journal: journalSpy() });

    const runtime = await machine.boot();

    expect(runtime.phase).toBe('empty');
    expect(runtime.session).toBeNull();
    expect(storage.calls).toEqual(['sessions.inProgress', 'sessions.nextScheduledOnOrAfter']);
  });

  it('surfaces a read failure as a failed boot and retries it', async () => {
    let fail = true;
    const storage = createFakeStorage({
      ...sessionFixture(NOW),
      failOn: (call) => fail && call === 'sessions.inProgress',
    });
    const machine = createSessionMachine({ storage, clock: clockAt(NOW), journal: journalSpy() });

    const failed = await machine.boot();
    expect(failed.phase).toBe('failed');
    expect(failed.error).toBe('No se pudo abrir la sesión. Inténtalo otra vez.');

    fail = false;
    storage.reset();
    const retried = await machine.retry(NOW);
    expect(retried.phase).toBe('ready');
    expect(retried.error).toBeNull();
  });

  it('builds the history of an exercise from the last stored sessions, today excluded', async () => {
    const { runtime } = await booted({
      storage: createFakeStorage({
        sessions: [...pastSessions(NOW), currentSession(NOW, { confirmedSets: 2, decision: { kind: 'accepted' } })],
        exercises: [DEADLIFT, BARBELL_ROW],
        profile: PROFILE,
      }),
    });

    const history = runtime.history[DEADLIFT.id] ?? [];
    expect(history.map((point) => point.weightKg)).toEqual([87.5, 82.5, 90, 87.5, 90, 92.5]);
    expect(history.at(-1)?.today).toBe(true);
    expect(history.at(-2)?.today).toBe(false);
    expect(runtime.history[BARBELL_ROW.id]).toBeUndefined();
  });
});

describe('the load decision', () => {
  it('makes no port call when the owner picks a weight: the decision travels with the first set', async () => {
    const { machine, storage, runtime } = await booted();
    expect(runtime.session?.exercises[0]?.decision).toBeNull();

    const next = await machine.dispatch({ type: 'weight-accepted', exerciseSessionId: ACTIVE_EXERCISE_ID }, NOW);

    expect(storage.calls).toEqual([]);
    expect(activeSession(next).exercises[0]?.decision).toEqual({ kind: 'accepted' });
  });

  it('records the decision and then the set, in that order, on the first confirmation', async () => {
    const { machine, storage } = await booted();
    await machine.dispatch({ type: 'weight-accepted', exerciseSessionId: ACTIVE_EXERCISE_ID }, NOW);
    storage.reset();

    const next = await machine.dispatch({ type: 'set-confirmed', ...answers(1) }, NOW);

    expect(storage.calls).toEqual(['sessions.recordDecision', 'sessions.confirmSet']);
    expect(activeSession(next).exercises[0]?.sets).toHaveLength(1);
    expect(storage.stored().at(-1)?.exercises[0]?.sets).toHaveLength(1);
  });

  it('writes only the set once the decision is already stored', async () => {
    const { machine, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
    });

    await machine.dispatch({ type: 'set-confirmed', ...answers(2) }, NOW);

    expect(storage.calls).toEqual(['sessions.confirmSet']);
  });

  it('refuses a second decision for the same exercise with no port call', async () => {
    const { machine, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
    });

    const next = await machine.dispatch(
      { type: 'weight-overridden', exerciseSessionId: ACTIVE_EXERCISE_ID, kg: 100 },
      NOW,
    );

    expect(storage.calls).toEqual([]);
    expect(next.rejection).toBe('Ya has elegido el peso de este ejercicio.');
    expect(activeSession(next).exercises[0]?.usedWeightKg).toBe(92.5);
  });
});

describe('navigation and sets', () => {
  it('pages forward and back without touching the port', async () => {
    const { machine, storage } = await booted();

    const forward = await machine.dispatch({ type: 'exercise-advanced' }, NOW);
    expect(activeSession(forward).activeIndex).toBe(1);
    const back = await machine.dispatch({ type: 'exercise-returned' }, NOW);
    expect(activeSession(back).activeIndex).toBe(0);
    expect(storage.calls).toEqual([]);
  });

  it('records a set with no rest in between: the next set is immediate', async () => {
    const { machine, storage } = await booted();
    await machine.dispatch({ type: 'weight-accepted', exerciseSessionId: ACTIVE_EXERCISE_ID }, NOW);
    await machine.dispatch({ type: 'set-confirmed', ...answers(1) }, NOW);
    storage.reset();

    const next = await machine.dispatch({ type: 'set-confirmed', ...answers(2) }, NOW);

    // S5: registering a set writes the set and asks nothing else — no timer to start,
    // nothing to dismiss, and the screen is already on the next set.
    expect(storage.calls).toEqual(['sessions.confirmSet']);
    expect(activeSession(next).exercises[0]?.sets).toHaveLength(2);
    expect(screenStateOf(next)).toBe('active');
  });

  it('never starts a rest even though the stored profile keeps the switch on', async () => {
    // The fixture profile says `autoStartRestTimer: true`, as a device that used the
    // old Perfil switch would: the session ignores it (§3 keeps the field, S5 removes
    // the timer).
    const { machine } = await booted();
    await machine.dispatch({ type: 'weight-accepted', exerciseSessionId: ACTIVE_EXERCISE_ID }, NOW);

    const next = await machine.dispatch({ type: 'set-confirmed', ...answers(1) }, NOW);

    expect(activeSession(next).rest.startedAt).toBeNull();
    expect(activeSession(next).rest.durationSeconds).toBeNull();
    expect(activeSession(next).status).toBe('inProgress');
  });
});

describe('finishing', () => {
  it('finishes a partial session with one port call', async () => {
    const { machine, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
    });

    const next = await machine.dispatch({ type: 'session-finished', outcome: 'partial' }, NOW);

    expect(storage.calls).toEqual(['sessions.finish']);
    expect(activeSession(next).status).toBe('partial');
  });

  it('refuses to finish as completed while a set is unanswered, with no port call', async () => {
    const { machine, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
    });

    const next = await machine.dispatch({ type: 'session-finished', outcome: 'completed' }, NOW);

    expect(storage.calls).toEqual([]);
    expect(next.rejection).toContain('Quedan series sin registrar');
    expect(activeSession(next).status).toBe('inProgress');
  });

  it('refuses to finish a session that never started', async () => {
    const { machine, storage } = await booted();

    const next = await machine.dispatch({ type: 'session-finished', outcome: 'partial' }, NOW);

    expect(storage.calls).toEqual([]);
    expect(next.rejection).toBe('La sesión no se ha empezado: no hay ninguna serie confirmada.');
  });
});

describe('rejections', () => {
  it('makes no port call and changes nothing when the event is refused', async () => {
    const { machine, storage, runtime } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
    });
    const before = runtime.session;

    const next = await machine.dispatch({ type: 'set-confirmed', ...answers(3) }, NOW);

    expect(storage.calls).toEqual([]);
    expect(next.rejection).toBe('Las series se registran en orden.');
    expect(next.session).toEqual(before);
  });
});

describe('Sugerir otro ejercicio (S4, T5)', () => {
  it('writes the swap to the row and gives the substitute its own history', async () => {
    const { machine, storage, runtime } = await booted();
    const before = activeSession(runtime).exercises[0];

    const next = await machine.substitute({
      exerciseSessionId: ACTIVE_EXERCISE_ID,
      candidate: RDL,
      now: NOW,
    });

    expect(storage.calls).toEqual(['sessions.substitute']);
    const swapped = activeSession(next).exercises[0];
    // The row keeps its id and takes the substitute's identity: from here on its
    // progression is its own (S6). The prescription of the slot does not move.
    expect(swapped?.id).toBe(ACTIVE_EXERCISE_ID);
    expect(swapped?.exerciseId).toBe(RDL.id);
    expect(swapped?.exerciseNameSnapshot).toBe(RDL.name);
    expect(swapped?.prescription).toEqual(before?.prescription);
    // The recommendation and the decision belonged to the exercise that left.
    expect(swapped?.decision).toBeNull();
    expect(swapped?.recommendation).toBeNull();
    expect(swapped?.usedWeightKg).toBeNull();
    // The read-out says what it replaced, and the card's library row is the new one.
    expect(next.substitutions[ACTIVE_EXERCISE_ID]?.exerciseNameSnapshot).toBe(
      'Peso muerto convencional',
    );
    expect(next.exercises[ACTIVE_EXERCISE_ID]?.name).toBe(RDL.name);

    const stored = storage
      .stored()
      .find((session) => session.id === activeSession(next).id)
      ?.exercises.find((exercise) => exercise.id === ACTIVE_EXERCISE_ID);
    expect(stored?.exerciseId).toBe(RDL.id);
    expect(stored?.substitutedFrom?.exerciseNameSnapshot).toBe('Peso muerto convencional');
  });

  it('refuses once the exercise has a confirmed set, and writes nothing', async () => {
    const { machine, runtime } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 2, decision: { kind: 'accepted' } }),
      }),
    });

    const next = await machine.substitute({
      exerciseSessionId: ACTIVE_EXERCISE_ID,
      candidate: RDL,
      now: NOW,
    });

    expect(next.rejection).not.toBeNull();
    expect(next.session).toBe(activeSession(runtime));
  });

  it('leaves the exercise as it was when the write fails', async () => {
    const failing = createFakeStorage({
      ...sessionFixture(NOW),
      failOn: (call) => call === 'sessions.substitute',
    });
    const machine = createSessionMachine({ storage: failing, clock: clockAt(NOW), journal: journalSpy() });
    const before = await machine.boot();

    const next = await machine.substitute({
      exerciseSessionId: ACTIVE_EXERCISE_ID,
      candidate: RDL,
      now: NOW,
    });

    expect(next.error).not.toBeNull();
    expect(activeSession(next).exercises[0]?.exerciseId).toBe(
      activeSession(before).exercises[0]?.exerciseId,
    );
  });
});

describe('failures', () => {
  it('leaves the set unconfirmed, says so, and retries the write', async () => {
    const { machine, storage, runtime } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
        failOn: (call) => call === 'sessions.confirmSet',
      }),
    });
    const before = runtime.session;
    const remainingBefore = before === null ? 0 : remainingSets(before, ACTIVE_EXERCISE_ID);

    const failed = await machine.dispatch({ type: 'set-confirmed', ...answers(2) }, NOW);

    expect(storage.calls).toEqual(['sessions.confirmSet']);
    expect(failed.error).toBe('No se pudo guardar la serie 2. Sigue en la pantalla.');
    expect(failed.session).toEqual(before);
    expect(remainingSets(activeSession(failed), ACTIVE_EXERCISE_ID)).toBe(remainingBefore);

    storage.reset();
    await machine.retry(NOW);
    expect(storage.calls).toEqual(['sessions.confirmSet']);
  });

  it('does not repeat a decision that was already written before the failure', async () => {
    const storage = createFakeStorage({
      ...sessionFixture(NOW),
      failOn: (call) => call === 'sessions.confirmSet',
    });
    const { machine } = await booted({ storage });
    await machine.dispatch({ type: 'weight-accepted', exerciseSessionId: ACTIVE_EXERCISE_ID }, NOW);
    await machine.dispatch({ type: 'set-confirmed', ...answers(1) }, NOW);
    expect(storage.calls).toEqual(['sessions.recordDecision', 'sessions.confirmSet']);

    storage.reset();
    const retried = await machine.retry(NOW);

    // The decision is already on disk; only the set is retried, and it still fails.
    expect(storage.calls).toEqual(['sessions.confirmSet']);
    expect(retried.error).not.toBeNull();
  });

  it('keeps the session open when the finish write fails', async () => {
    const { machine, storage } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
        failOn: (call) => call === 'sessions.finish',
      }),
    });

    const next = await machine.dispatch({ type: 'session-finished', outcome: 'partial' }, NOW);

    expect(storage.calls).toEqual(['sessions.finish']);
    expect(next.error).toBe('No se pudo cerrar la sesión. Inténtalo otra vez.');
    expect(activeSession(next).status).toBe('inProgress');
  });
});

describe('the journal', () => {
  it('writes the state after every applied event and clears it on a terminal one', async () => {
    const journal = journalSpy();
    const { machine } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
      }),
      journal,
    });

    await machine.dispatch({ type: 'exercise-advanced' }, NOW);
    expect(journal.writes).toHaveLength(1);
    expect(journal.peek()?.activeIndex).toBe(1);

    const finished = await machine.dispatch({ type: 'session-finished', outcome: 'partial' }, NOW);
    expect(finished.error).toBeNull();
    expect(journal.clears).toBe(1);
    expect(journal.peek()).toBeNull();
  });

  it('does not write the journal for a rejected or a failed event', async () => {
    const journal = journalSpy();
    const { machine } = await booted({
      storage: createFakeStorage({
        ...sessionFixture(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }),
        failOn: (call) => call === 'sessions.confirmSet',
      }),
      journal,
    });

    await machine.dispatch({ type: 'set-confirmed', ...answers(3) }, NOW);
    expect(journal.writes).toHaveLength(0);

    await machine.dispatch({ type: 'set-confirmed', ...answers(2) }, NOW);
    expect(journal.writes).toHaveLength(0);
  });
});

describe('sessionSourceFrom', () => {
  it('converts a stored aggregate into the reducer recovery input', () => {
    const session = currentSession(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } });
    const source = sessionSourceFrom(session);

    expect(source.id).toBe(session.id);
    expect(source.exercises[0]?.sets).toHaveLength(1);
    expect(source.exercises[0]?.recommendation?.computedAt).toBe(
      session.exercises[0]?.recommendation?.computedAt.getTime(),
    );
    expect(source.exercises[0]?.decision).toEqual({ kind: 'accepted' });
  });

  it('produces a state the reducer recognises as answered when everything is logged', () => {
    const source = sessionSourceFrom(currentSession(NOW, { allAnswered: true, status: 'inProgress' }));
    expect(source.exercises.every((exercise) => exercise.sets.length === exercise.prescription.sets)).toBe(true);
    expect(source.status).toBe('inProgress');
  });
});

describe('isSessionAnswered', () => {
  it('is the reducer predicate the finish path relies on', async () => {
    const { runtime } = await booted({
      storage: createFakeStorage({ ...sessionFixture(NOW, { allAnswered: true, status: 'inProgress' }) }),
    });
    expect(isSessionAnswered(activeSession(runtime))).toBe(true);
  });
});

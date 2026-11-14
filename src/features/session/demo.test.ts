/**
 * The demo fixture: every required state of the Sesión screen, and no drift from the
 * domain.
 *
 * Two contracts, both about honesty rather than pixels:
 *
 * 1. **Coverage.** The design's Sesión row names first time, resumed after the app was
 *    killed, resumed after the page was discarded, resumed after the screen slept,
 *    finished, partial — plus the error state the `sesion-error` render draws. Every
 *    one of them must be reachable from the demo, or the screen cannot be reviewed on
 *    the phone.
 * 2. **No drift.** The fixtures are typed as `WorkoutSession`, and the reducer must
 *    accept what the storage shape produces. A fixture that outgrows the domain stops
 *    compiling here, before it reaches the device.
 */

import { describe, expect, it } from 'vitest';
import { reduce, type SessionEvent } from '../../core/session/model';
import type { WorkoutSession } from '../../storage';
import { screenStateOf, sessionSourceFrom, type ScreenState } from './controller';
import { DEMO_SCENARIOS, demoScenario, runDemoScenario } from './demo';
import { currentSession, DEMO_NOW, pastSessions, sessionFixture } from './fixture';
import { snapshotFromSource } from '../../core/session/model';

const NOW = DEMO_NOW;

/** The states docs/design-system.md §8 and the approved renders require. */
const REQUIRED: readonly ScreenState[] = [
  'first-time',
  'decision',
  'resumed',
  'recovered',
  'active',
  'finished',
  'partial',
  'error',
];

describe('the demo covers every required state of the screen', () => {
  it('reaches each one from a scenario', async () => {
    const reached = new Set<ScreenState>();
    for (const scenario of DEMO_SCENARIOS) {
      const run = await runDemoScenario(scenario, NOW);
      reached.add(screenStateOf(run.runtime));
    }

    const missing = REQUIRED.filter((state) => !reached.has(state));
    expect(missing).toEqual([]);
  });

  it('names every scenario once, in Spanish', () => {
    const ids = DEMO_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of DEMO_SCENARIOS) {
      expect(scenario.label.length).toBeGreaterThan(0);
      expect(scenario.hint.length).toBeGreaterThan(0);
    }
    expect(demoScenario('reanudada').label).toBe('Reanudada');
  });

  it('resumes from the journal after a kill and from storage after a discarded page', async () => {
    const killed = await runDemoScenario(demoScenario('reanudada'), NOW);
    expect(screenStateOf(killed.runtime)).toBe('resumed');
    expect(killed.runtime.session?.exercises[0]?.sets.map((entry) => entry.status)).toEqual([
      'confirmed',
      'skipped',
    ]);

    const discarded = await runDemoScenario(demoScenario('pagina-descartada'), NOW);
    expect(screenStateOf(discarded.runtime)).toBe('recovered');
    expect(discarded.runtime.session?.exercises[0]?.sets.map((entry) => entry.status)).toEqual([
      'confirmed',
      'confirmed',
    ]);
  });

  it('keeps a session with confirmed sets on the next set, with no rest state in between', async () => {
    const run = await runDemoScenario(demoScenario('sin-descanso'), NOW);

    // S5: the confirmed sets are the state; nothing waits for a countdown, and the
    // screen is already on the set that follows.
    expect(screenStateOf(run.runtime)).toBe('active');
    expect(run.runtime.session?.exercises[0]?.sets.map((entry) => entry.status)).toEqual([
      'confirmed',
      'confirmed',
    ]);
  });

  it('keeps the failed set unconfirmed in the error scenario', async () => {
    const run = await runDemoScenario(demoScenario('error'), NOW);

    expect(screenStateOf(run.runtime)).toBe('error');
    expect(run.runtime.error).toBe('No se pudo guardar la serie 2. Sigue en la pantalla.');
    expect(run.runtime.session?.exercises[0]?.sets).toHaveLength(1);
    expect(run.storage.calls).toEqual(['sessions.confirmSet']);
  });
});

describe('the demo never reaches IndexedDB', () => {
  it('writes into the in-memory port and nowhere else', async () => {
    const run = await runDemoScenario(demoScenario('parcial'), NOW);

    // The recorded calls live in this process: the demo port is the fake, not the
    // IndexedDB adapter, and its `stored()` view shows the write it made.
    // S4/T7: the close also asks the programme whether the block moves, which reads the
    // phase state and the history from the same in-memory port and writes nothing here.
    expect(run.storage.calls).toEqual(['sessions.finish', 'meta.readPhaseState', 'sessions.recent']);
    expect(run.storage.stored().find((session) => session.id === 'session-demo')?.status).toBe('partial');
  });

  it('never opens a database', async () => {
    for (const scenario of DEMO_SCENARIOS) {
      const run = await runDemoScenario(scenario, NOW);
      expect(run.storage.calls).not.toContain('open');
    }
  });
});

describe('the fixture does not drift from the domain', () => {
  it('is typed as the stored aggregate and produces the reducer input', () => {
    const sessions: readonly WorkoutSession[] = [...pastSessions(NOW), currentSession(NOW)];
    const source = sessionSourceFrom(sessions.at(-1) as WorkoutSession);

    expect(source.id).toBe('session-demo');
    expect(source.exercises).toHaveLength(6);
    expect(source.exercises[0]?.recommendation?.computedAt).toBeTypeOf('number');
  });

  it('survives a round trip through the reducer', () => {
    const source = sessionSourceFrom(currentSession(NOW, { confirmedSets: 1, decision: { kind: 'accepted' } }));
    let state = snapshotFromSource(source, true);

    const events: readonly SessionEvent[] = [
      { type: 'exercise-advanced' },
      { type: 'exercise-returned' },
      { type: 'rest-skipped' },
    ];

    for (const event of events) {
      const transition = reduce(state, event, NOW);
      expect(transition.rejection?.message ?? null).toBeNull();
      state = transition.state;
    }

    // `weight-accepted` is the one refusal that is correct here: the fixture already
    // carries the decision, so the reducer must not record a second one (I-8).
    expect(reduce(state, { type: 'weight-accepted', exerciseSessionId: 'xs-1' }, NOW).rejection?.code).toBe(
      'decisionRecorded',
    );
  });

  it('seeds exactly one open session and the history behind it', () => {
    const fixture = sessionFixture(NOW);
    const open = fixture.sessions.filter((session) => session.status !== 'completed');

    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe('session-demo');
    expect(fixture.sessions.length).toBeGreaterThan(1);
    expect(fixture.exercises.map((exercise) => exercise.id)).toContain('ex-peso-muerto');
  });
});

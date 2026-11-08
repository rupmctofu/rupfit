/**
 * `#/sesion/demo` — the session screen on a phone, before Inicio exists.
 *
 * Nine scenarios, one per state the design's Sesión row requires plus the two the
 * renders draw. Each scenario is *data*: a seed for the in-memory port, an optional
 * journal and, where a boot alone cannot reach the state (a failed write, a finished
 * session), one primed event. `runDemoScenario` is the whole recipe, so the test that
 * proves every required state exists runs exactly what the phone runs.
 *
 * Nothing here can reach IndexedDB: the port is `createFakeStorage`.
 */

import { EFFORT } from '../../core/domain';
import {
  reduce,
  snapshotFromSource,
  type SessionState,
} from '../../core/session/model';
import { createSessionMachine, sessionSourceFrom, type SessionJournal, type SessionMachine, type SessionRuntime } from './controller';
import { createFakeStorage, type FakeStorage, type FakeStorageSeed } from './fake-port';
import { currentSession, sessionFixture, type CurrentSessionSpec } from './fixture';

export type DemoScenarioId =
  | 'primera-vez'
  | 'decision'
  | 'reanudada'
  | 'pagina-descartada'
  | 'descanso'
  | 'dormida'
  | 'error'
  | 'parcial'
  | 'terminada';

export interface DemoScenario {
  readonly id: DemoScenarioId;
  readonly label: string;
  /** What the scenario is for, in one line, on the demo bar's title attribute. */
  readonly hint: string;
  readonly seed: (now: number) => FakeStorageSeed;
  /** The serialised state that survived an app kill, when the scenario has one. */
  readonly journal?: ((now: number) => SessionState) | undefined;
  readonly failOn?: ((call: string) => boolean) | undefined;
  /** The owner already tapped `Seguir`: the resume banner is gone. */
  readonly settled?: boolean | undefined;
  /** One event the boot cannot produce on its own. */
  readonly prime?: ((machine: SessionMachine, now: number) => Promise<unknown>) | undefined;
}

const ACTIVE = 'xs-1';

function seedFor(spec: CurrentSessionSpec): (now: number) => FakeStorageSeed {
  return (now) => ({ ...sessionFixture(now, spec) });
}

/**
 * The state an app kill would have left in the journal: the recovered session plus the
 * skipped slot storage does not keep (§5.2 stores confirmed sets only).
 */
function journalWithSkip(now: number, spec: CurrentSessionSpec, slot: number): SessionState {
  const source = sessionSourceFrom(currentSession(now, spec));
  const recovered = snapshotFromSource(source, true);
  return reduce(recovered, { type: 'set-skipped', exerciseSessionId: ACTIVE, slot }, now).state;
}

function confirmSecondSet(machine: SessionMachine, now: number): Promise<SessionRuntime> {
  return machine.dispatch(
    {
      type: 'set-confirmed',
      exerciseSessionId: ACTIVE,
      slot: 2,
      weightKg: 92.5,
      actualReps: 10,
      effort: EFFORT.correct,
      discomfort: null,
    },
    now,
  );
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 'primera-vez',
    label: 'Primera vez',
    hint: 'Sin historial: elige un peso, no hay recomendación todavía.',
    seed: seedFor({ activeIndex: 3, skipBefore: true }),
  },
  {
    id: 'decision',
    label: 'Decisión',
    hint: 'Última vez 90 kg, hoy 92,5 kg: aceptar, repetir u otro peso.',
    seed: seedFor({}),
  },
  {
    id: 'reanudada',
    label: 'Reanudada',
    hint: 'La app murió y el diario sobrevivió: la serie saltada sigue saltada.',
    seed: seedFor({ confirmedSets: 1, decision: { kind: 'accepted' } }),
    journal: (now) => journalWithSkip(now, { confirmedSets: 1, decision: { kind: 'accepted' } }, 2),
  },
  {
    id: 'pagina-descartada',
    label: 'Página descartada',
    hint: 'Solo queda lo guardado: se reconstruye desde el almacenamiento.',
    seed: seedFor({ confirmedSets: 2, decision: { kind: 'accepted' } }),
  },
  {
    id: 'descanso',
    label: 'Descanso',
    hint: 'El descanso corre desde la confirmación: quedan 1:45.',
    seed: seedFor({ confirmedSets: 2, decision: { kind: 'accepted' }, lastSetAgoSeconds: 75 }),
    settled: true,
  },
  {
    id: 'dormida',
    label: 'Pantalla dormida',
    hint: 'La pantalla se apagó: el descanso ya terminó y lo dice.',
    seed: seedFor({ confirmedSets: 2, decision: { kind: 'accepted' }, lastSetAgoSeconds: 200 }),
    settled: true,
  },
  {
    id: 'error',
    label: 'Error al guardar',
    hint: 'La escritura falla: la serie sigue sin confirmar y se puede reintentar.',
    seed: seedFor({ confirmedSets: 1, decision: { kind: 'accepted' } }),
    failOn: (call) => call === 'sessions.confirmSet',
    prime: confirmSecondSet,
  },
  {
    id: 'parcial',
    label: 'Parcial',
    hint: 'Se termina a medias y lo hecho queda guardado.',
    seed: seedFor({ confirmedSets: 1, decision: { kind: 'accepted' } }),
    prime: (machine, now) => machine.dispatch({ type: 'session-finished', outcome: 'partial' }, now),
  },
  {
    id: 'terminada',
    label: 'Terminada',
    hint: 'Todas las series registradas y la sesión cerrada.',
    seed: seedFor({ allAnswered: true, status: 'inProgress' }),
    prime: (machine, now) => machine.dispatch({ type: 'session-finished', outcome: 'completed' }, now),
  },
];

export function demoScenario(id: DemoScenarioId): DemoScenario {
  const scenario = DEMO_SCENARIOS.find((candidate) => candidate.id === id);
  if (scenario === undefined) throw new Error(`unknown demo scenario: ${id}`);
  return scenario;
}

/** The demo's port: in memory, seeded, and unable to reach IndexedDB. */
export function demoStorage(scenario: DemoScenario, now: number): FakeStorage {
  return createFakeStorage({
    ...scenario.seed(now),
    ...(scenario.failOn === undefined ? {} : { failOn: scenario.failOn }),
  });
}

/** The demo's journal: the seeded state, then whatever the session writes. */
export function demoJournal(scenario: DemoScenario, now: number): SessionJournal {
  let current = scenario.journal?.(now) ?? null;
  return {
    read: () => current,
    write: (state) => {
      current = state;
    },
    clear: () => {
      current = null;
    },
  };
}

export interface DemoRun {
  readonly scenario: DemoScenario;
  readonly storage: FakeStorage;
  readonly journal: SessionJournal;
  readonly machine: SessionMachine;
  readonly runtime: SessionRuntime;
}

/** Boots the scenario exactly as `#/sesion/demo` does. */
export async function runDemoScenario(scenario: DemoScenario, now: number): Promise<DemoRun> {
  const storage = demoStorage(scenario, now);
  const journal = demoJournal(scenario, now);
  const machine = createSessionMachine({ storage, clock: { now: () => now }, journal });
  await machine.boot();
  // The boot reads are not part of what a scenario demonstrates: what follows is the
  // write the state is about, and that is what a reviewer or a test wants to see.
  storage.reset();
  if (scenario.settled === true) machine.dismissRecovery();
  if (scenario.prime !== undefined) await scenario.prime(machine, now);
  return { scenario, storage, journal, machine, runtime: machine.runtime() };
}

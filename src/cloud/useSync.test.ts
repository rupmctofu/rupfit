/**
 * The five states of spec S8, driven — odd/tasks/cloud-sync.md T5, specs S1, S2, S4, S8.
 *
 * The state machine (`createSyncRunner`) is the part of the hook that decides what the
 * account card prints, and it is the part that can be wrong silently: a pass that throws
 * showing `sincronizado`, a signed-out session pushing rows into another account's queue,
 * two passes over one watermark, a failed queue read reported as success. So it takes an
 * injected engine, clock and timers, and every test below walks one of those dangers.
 *
 * `useSync` itself is the React shell around this runner (subscribe, platform events,
 * build the service once); the runner is where the decisions are, and it is what these
 * tests exercise without a DOM.
 */

import { describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import {
  engineOf,
  createSyncRunner,
  storeOf,
  type SyncEnginePort,
  type SyncPassSummary,
  type SyncRunner,
  type SyncTimers,
} from './useSync';
import type { MigrationReport } from './migrate';
import type { SyncService } from './sync';
import type { OutboxOp, SyncConflict } from './types';
import type { StoredSyncRow, SyncStoragePort } from '../storage';
import {
  syncStateWords,
  type SyncFailReason,
  type SyncPhase,
} from '../features/profile/account-sync';

const NOW = 1_760_000_000_000;
const TWO_SECONDS = 2000;

/** An engine whose every answer a test chooses, and which counts how it was called. */
class FakeEngine implements SyncEnginePort {
  passes = 0;
  running = 0;
  peak = 0;
  pending = 0;
  conflicts = 0;
  summary: SyncPassSummary = { status: 'completed', failures: 0 };
  /** `throw` makes the pass reject; `pending` makes the queue unreadable. */
  breach: 'none' | 'throw' | 'pending' = 'none';
  gate: { readonly promise: Promise<void>; readonly release: () => void } | null = null;

  async pass(): Promise<SyncPassSummary> {
    this.passes += 1;
    this.running += 1;
    this.peak = Math.max(this.peak, this.running);
    try {
      if (this.gate !== null) await this.gate.promise;
      if (this.breach === 'throw') throw new Error('sin red');
      return this.summary;
    } finally {
      this.running -= 1;
    }
  }

  async pendingCount(): Promise<number> {
    if (this.breach === 'pending') throw new Error('la cola no se puede leer');
    return this.pending;
  }

  async conflictCount(): Promise<number> {
    return this.conflicts;
  }
}

function gate(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Timers a test fires by hand: two seconds pass when the test says so. */
function manualTimers(): { timers: SyncTimers; fire: () => void; scheduled: () => number } {
  const waiting = new Map<number, () => void>();
  let next = 1;

  return {
    timers: {
      schedule(callback) {
        const id = next;
        next += 1;
        waiting.set(id, callback);
        return id;
      },
      cancel(handle) {
        waiting.delete(handle as number);
      },
    },
    fire() {
      const due = [...waiting.values()];
      waiting.clear();
      for (const callback of due) callback();
    },
    scheduled: () => waiting.size,
  };
}

/** Let the fire-and-forget pass run to the end of its await chain. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function runnerWith(engine: SyncEnginePort | null, timers: SyncTimers): ReturnType<typeof createSyncRunner> {
  return createSyncRunner({ engine, now: () => NOW, debounceMs: TWO_SECONDS, timers });
}

describe('createSyncRunner: signed out', () => {
  it('does no work at all, and queues nothing', async () => {
    const engine = new FakeEngine();
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.noteLocalWrite();
    runner.syncNow();
    runner.setOnline(true);
    await settle();

    expect(engine.passes).toBe(0);
    expect(manual.scheduled()).toBe(0);
    expect(runner.state()).toEqual({
      phase: 'offline',
      pending: 0,
      lastSyncedAt: null,
      conflicts: 0,
      migrated: null,
      reason: null,
    });
  });

  it('stays inert in a build with no engine, even signed in', async () => {
    const manual = manualTimers();
    const runner = runnerWith(null, manual.timers);

    runner.setSignedIn(true);
    runner.noteLocalWrite();
    runner.syncNow();
    await settle();

    expect(runner.state().phase).toBe('offline');
    expect(runner.state().pending).toBe(0);
  });

  it('forgets the previous account the moment the session ends', async () => {
    const engine = new FakeEngine();
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();
    expect(runner.state().phase).toBe('synced');

    runner.setSignedIn(false);
    expect(runner.state()).toEqual({
      phase: 'offline',
      pending: 0,
      lastSyncedAt: null,
      conflicts: 0,
      migrated: null,
      reason: null,
    });

    const passes = engine.passes;
    runner.noteLocalWrite();
    runner.syncNow();
    await settle();
    expect(engine.passes).toBe(passes);
  });
});

describe('createSyncRunner: the five states', () => {
  it('runs a pass on sign-in and reports `sincronizado` with the moment', async () => {
    const engine = new FakeEngine();
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(engine.passes).toBe(1);
    expect(runner.state()).toEqual({
      phase: 'synced',
      pending: 0,
      lastSyncedAt: NOW,
      conflicts: 0,
      migrated: null,
      reason: null,
    });
  });

  it('reports `cambios pendientes` with the count the queue returns', async () => {
    const engine = new FakeEngine();
    engine.pending = 3;
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('pending');
    expect(runner.state().pending).toBe(3);
    expect(runner.state().lastSyncedAt).toBeNull();
  });

  it('reports `error` when the pass records failures', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'completed', failures: 2 };
    engine.pending = 2;
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('failed');
    expect(runner.state().pending).toBe(2);
  });

  it('reports `error` when the pass throws instead of answering', async () => {
    const engine = new FakeEngine();
    engine.breach = 'throw';
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('failed');
  });

  it('reports `error` when the queue cannot even be read', async () => {
    const engine = new FakeEngine();
    engine.breach = 'pending';
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('failed');
  });

  it('does not claim a result from a pass another caller is running', async () => {
    const engine = new FakeEngine();
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();
    const before = runner.state();

    engine.summary = { status: 'busy', failures: 0 };
    runner.syncNow();
    await settle();

    expect(runner.state()).toEqual(before);
  });

  it('counts the conflicts the merge kept (S5)', async () => {
    const engine = new FakeEngine();
    engine.conflicts = 2;
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().conflicts).toBe(2);
  });
});

describe('createSyncRunner: the triggers', () => {
  it('runs a pass on `online` and says `sin conexión` on `offline`', async () => {
    const engine = new FakeEngine();
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();
    engine.pending = 1;
    runner.noteLocalWrite();
    await settle();

    runner.setOnline(false);
    expect(runner.state().phase).toBe('offline');
    const passes = engine.passes;

    runner.setOnline(true);
    await settle();
    expect(engine.passes).toBe(passes + 1);
    expect(runner.state().phase).toBe('pending');
  });

  it('debounces a local write by two seconds, once per burst', async () => {
    const engine = new FakeEngine();
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();
    expect(engine.passes).toBe(1);

    runner.noteLocalWrite();
    runner.noteLocalWrite();
    runner.noteLocalWrite();
    await settle();
    expect(engine.passes).toBe(1);
    expect(manual.scheduled()).toBe(1);

    manual.fire();
    await settle();
    expect(engine.passes).toBe(2);
  });

  it('syncs now when asked, cancelling a pending debounce', async () => {
    const engine = new FakeEngine();
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();
    runner.noteLocalWrite();
    runner.syncNow();
    await settle();

    expect(engine.passes).toBe(2);
    expect(manual.scheduled()).toBe(0);
    manual.fire();
    await settle();
    expect(engine.passes).toBe(2);
  });

  it('never runs two passes at once, and keeps the trigger that arrived mid-pass', async () => {
    const engine = new FakeEngine();
    const hold = gate();
    engine.gate = hold;
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();
    expect(runner.state().phase).toBe('syncing');

    runner.syncNow();
    runner.syncNow();
    await settle();
    expect(engine.passes).toBe(1);

    engine.gate = null;
    hold.release();
    await settle();
    expect(engine.passes).toBe(2);
    expect(engine.peak).toBe(1);
    expect(runner.state().phase).toBe('synced');
  });

  it('notifies every subscriber, and stops when it is stopped', async () => {
    const engine = new FakeEngine();
    const runner = runnerWith(engine, manualTimers().timers);
    const seen: string[] = [];
    const stop = runner.subscribe((state) => seen.push(state.phase));

    runner.setSignedIn(true);
    await settle();
    expect(seen).toContain('syncing');
    expect(seen[seen.length - 1]).toBe('synced');

    stop();
    runner.setSignedIn(false);
    expect(seen[seen.length - 1]).toBe('synced');
  });
});

/* ------------------------------------- el almacén que se lee antes de la petición */

/**
 * `storeOf` construye las dos mitades que el servicio lee antes de hablar con nadie: la
 * cola en el `meta` del historial y las marcas de tirada y los conflictos en
 * `rupfit-cloud`. La primera lectura de una pasada es `conflicts()`, así que todo esto
 * ocurre **antes** de la primera petición a Supabase.
 *
 * Estas dos pruebas existen porque ahí es donde el dueño vio la tarjeta quedarse en
 * `Error de sincronización` sin una sola petición en el registro de red: un almacén que
 * no contesta nunca. `answers` convierte ese silencio en un fallo con nombre en vez de
 * dejar que la prueba entera agote su tiempo.
 */
function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) globals[name] = value;
  const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
  globals['indexedDB'] = factory;
}

async function answers<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} no contesta: la pasada se queda esperando`)),
      500,
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Un `SyncStoragePort` con las dos mitades vacías, sin tocar IndexedDB. */
function emptyStorage(): SyncStoragePort {
  const rows: StoredSyncRow[] = [];
  const ops = new Map<string, OutboxOp>();
  const queue: ReturnType<SyncStoragePort['queue']> = {
    allOps: () => Promise.resolve([...ops.values()]),
    putOps: (written) => {
      for (const op of written) ops.set(op.id, { ...op });
      return Promise.resolve();
    },
    removeOps: (ids) => {
      for (const id of ids) ops.delete(id);
      return Promise.resolve();
    },
  };

  return {
    readSyncRow: () => Promise.resolve(rows[0]),
    listSyncRows: () => Promise.resolve(rows),
    applySyncRow: () => Promise.resolve(),
    readPushWatermark: () => Promise.resolve(null),
    writePushWatermark: () => Promise.resolve(),
    queue: () => queue,
  };
}

const CONFLICT: SyncConflict = {
  table: 'sets',
  rowId: 'set-1',
  keptVersion: { rev: 2, updatedAt: NOW, deletedAt: null, values: {} },
  discardedVersion: { rev: 1, updatedAt: NOW - 1, deletedAt: null, values: {} },
  at: NOW,
};

describe('storeOf: el almacén que se lee antes de la primera petición', () => {
  it('contesta la cola, las marcas y los conflictos en vez de callarse para siempre', async () => {
    freshIndexedDb();
    const store = await storeOf(emptyStorage());

    expect(await answers(store.allOps(), 'la cola')).toEqual([]);
    expect(await answers(store.conflicts(), 'los conflictos')).toEqual([]);
    expect(await answers(store.watermarks(), 'las marcas')).toEqual([]);
  });

  it('guarda lo que se le escribe, para que la siguiente pasada no vuelva a bajar todo', async () => {
    freshIndexedDb();
    const store = await storeOf(emptyStorage());

    await answers(store.putWatermark({ table: 'sets', since: NOW }), 'putWatermark');
    await answers(store.addConflicts([CONFLICT]), 'addConflicts');

    expect(await answers(store.watermarks(), 'las marcas')).toEqual([{ table: 'sets', since: NOW }]);
    expect(await answers(store.conflicts(), 'los conflictos')).toHaveLength(1);
  });
});

/* ------------------------------------------------- la migración y el presupuesto */

/** Un informe de la migración, con lo que cada prueba quiera decir. */
function report(overrides: Partial<MigrationReport> = {}): MigrationReport {
  return {
    status: 'completed',
    counts: { sessions: 0, measurements: 0, activities: 0 },
    stamped: 0,
    queued: 0,
    error: null,
    ...overrides,
  };
}

/** La migración falsa: cuenta las cuentas que atendió y puede romperse a la carta. */
class FakeMigration {
  readonly calls: string[] = [];
  answer: MigrationReport = report();
  breach: 'none' | 'throw' = 'none';

  migrate = async (account: string): Promise<MigrationReport> => {
    this.calls.push(account);
    if (this.breach === 'throw') throw new Error('el almacén no contesta');
    return this.answer;
  };
}

function runnerWithMigration(
  engine: SyncEnginePort | null,
  migration: FakeMigration,
  timers: SyncTimers,
): SyncRunner {
  return createSyncRunner({
    engine,
    migrate: migration.migrate,
    now: () => NOW,
    debounceMs: TWO_SECONDS,
    timers,
  });
}

describe('createSyncRunner: la migración del historial (L7)', () => {
  it('migra una vez por cuenta, antes de la pasada, y nunca dos veces', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(migration.calls).toEqual(['rober@example.com']);
    expect(engine.passes).toBe(1);

    runner.setSignedIn(false);
    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    // La misma cuenta no se vuelve a migrar en la sesión (S7: «No duplicar
    // entrenamientos»), pero sí se sincroniza otra vez.
    expect(migration.calls).toEqual(['rober@example.com']);
    expect(engine.passes).toBe(2);
  });

  it('migra la segunda cuenta por su cuenta', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();
    runner.setSignedIn(true, 'otra@example.com');
    await settle();

    expect(migration.calls).toEqual(['rober@example.com', 'otra@example.com']);
  });

  it('no migra nada sin cuenta: una sesión sin correo no toca el historial', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(migration.calls).toEqual([]);
    expect(engine.passes).toBe(1);
  });

  it('lleva el informe a la tarjeta, con la pasada que lo completa', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    migration.answer = report({
      counts: { sessions: 12, measurements: 4, activities: 30 },
      stamped: 46,
      queued: 46,
    });
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(runner.state().migrated).toEqual({
      sessions: 12,
      measurements: 4,
      activities: 30,
      failed: false,
    });
    expect(runner.state().phase).toBe('synced');
  });

  it('una migración rota se dice, y no impide la pasada', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    migration.answer = report({ status: 'failed', error: 'sets: no se puede leer' });
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(engine.passes).toBe(1);
    expect(runner.state().phase).toBe('synced');
    expect(runner.state().migrated?.failed).toBe(true);
  });

  it('una migración que lanza tampoco deja la tarjeta girando', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    migration.breach = 'throw';
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(engine.passes).toBe(1);
    expect(runner.state().phase).toBe('synced');
    expect(runner.state().migrated?.failed).toBe(true);
  });

  it('un informe sin nada que migrar no ensucia la tarjeta', async () => {
    const engine = new FakeEngine();
    const migration = new FakeMigration();
    migration.answer = report({ status: 'idle' });
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(runner.state().migrated).toBeNull();
  });
});

describe('createSyncRunner: la tarjeta sale de `sincronizando`', () => {
  it('una pasada que no contesta declara error al agotar el presupuesto', async () => {
    const engine = new FakeEngine();
    const hold = gate();
    engine.gate = hold;
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();
    expect(runner.state().phase).toBe('syncing');

    // El presupuesto de la pasada vence: la tarjeta deja de esperar y lo dice.
    manual.fire();
    expect(runner.state().phase).toBe('failed');

    // Y si la pasada llega después y funcionó, su resultado se publica igual.
    engine.gate = null;
    hold.release();
    await settle();
    expect(runner.state().phase).toBe('synced');
    expect(runner.state().lastSyncedAt).toBe(NOW);
  });

  it('una pasada con la cola vacía deja `sincronizado` y su instante', async () => {
    const engine = new FakeEngine();
    engine.pending = 0;
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state()).toEqual({
      phase: 'synced',
      pending: 0,
      lastSyncedAt: NOW,
      conflicts: 0,
      migrated: null,
      reason: null,
    });
    // Y ningún temporizador queda armado: ni el del tope ni el del rebote.
    expect(manual.scheduled()).toBe(0);
  });

  it('una pasada con la cola llena deja `cambios pendientes`, no un giro', async () => {
    const engine = new FakeEngine();
    engine.pending = 5;
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('pending');
    expect(runner.state().pending).toBe(5);
    expect(runner.state().lastSyncedAt).toBeNull();
  });

  it('un resultado `busy` con cola pendiente se contesta con la cola', async () => {
    const engine = new FakeEngine();
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();
    expect(runner.state().phase).toBe('synced');

    engine.summary = { status: 'busy', failures: 0 };
    engine.pending = 2;
    runner.syncNow();
    await settle();

    expect(runner.state().phase).toBe('pending');
    expect(runner.state().pending).toBe(2);
    // El instante de la última sincronización buena no se inventa uno nuevo.
    expect(runner.state().lastSyncedAt).toBe(NOW);
  });
});

describe('createSyncRunner: el motivo, para que el fallo diga dónde falló', () => {
  /** El estado del motor, con las palabras que la tarjeta imprimiría. */
  const cardOf = (state: { readonly phase: string; readonly pending: number; readonly lastSyncedAt: number | null; readonly reason: string | null }) =>
    syncStateWords({
      phase: state.phase as SyncPhase,
      pendingCount: state.pending,
      lastSyncedAt: state.lastSyncedAt,
      reason: state.reason as SyncFailReason | null,
    });

  it('dice `remote` cuando el servicio registró un fallo de envío o de bajada', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'completed', failures: 1, stages: ['push'] };
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('failed');
    expect(runner.state().reason).toBe('remote');
    expect(cardOf(runner.state()).detail).toBe(
      'La nube rechazó parte de la sincronización. Lo que has guardado sigue aquí.',
    );
  });

  it('dice `queue` cuando lo que no se pudo leer o escribir fue este dispositivo', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'completed', failures: 1, stages: ['store'] };
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().reason).toBe('queue');
    expect(cardOf(runner.state()).detail).toBe(
      'No se pudo preparar la cola en este dispositivo. Lo que has guardado sigue aquí.',
    );
  });

  it('dice `queue` cuando la cola no se puede ni leer', async () => {
    const engine = new FakeEngine();
    engine.breach = 'pending';
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().reason).toBe('queue');
  });

  it('dice `network` cuando la pasada lanza en vez de contestar', async () => {
    const engine = new FakeEngine();
    engine.breach = 'throw';
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().reason).toBe('network');
    expect(cardOf(runner.state()).detail).toBe(
      'No se pudo hablar con la nube. Lo que has guardado sigue aquí.',
    );
  });

  it('dice `network` cuando se agota el presupuesto sin una sola respuesta', async () => {
    const engine = new FakeEngine();
    const hold = gate();
    engine.gate = hold;
    const manual = manualTimers();
    const runner = runnerWith(engine, manual.timers);

    runner.setSignedIn(true);
    await settle();
    manual.fire();

    expect(runner.state().phase).toBe('failed');
    expect(runner.state().reason).toBe('network');

    engine.gate = null;
    hold.release();
    await settle();
  });

  it('dice `migration` cuando el primero que se rompió fue el historial', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'failed', failures: 1 };
    const migration = new FakeMigration();
    migration.breach = 'throw';
    const runner = runnerWithMigration(engine, migration, manualTimers().timers);

    runner.setSignedIn(true, 'rober@example.com');
    await settle();

    expect(runner.state().phase).toBe('failed');
    expect(runner.state().reason).toBe('migration');
    expect(cardOf(runner.state()).detail).toBe(
      'No se pudo preparar el historial en este dispositivo. Lo que has guardado sigue aquí.',
    );
  });

  it('no se inventa un culpable cuando el fallo no dejó ninguna etapa', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'completed', failures: 2 };
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();

    expect(runner.state().phase).toBe('failed');
    expect(runner.state().reason).toBeNull();
    expect(cardOf(runner.state()).detail).toBe(
      'Lo que has guardado no se ha perdido: sigue en este dispositivo.',
    );
  });

  it('olvida el motivo en cuanto la siguiente pasada funciona', async () => {
    const engine = new FakeEngine();
    engine.summary = { status: 'completed', failures: 1, stages: ['pull'] };
    const runner = runnerWith(engine, manualTimers().timers);

    runner.setSignedIn(true);
    await settle();
    expect(runner.state().reason).toBe('remote');

    engine.summary = { status: 'completed', failures: 0 };
    runner.syncNow();
    await settle();

    expect(runner.state().phase).toBe('synced');
    expect(runner.state().reason).toBeNull();
  });
});

describe('engineOf', () => {
  it('reduces a service pass to a status, a failure count and a pending count', async () => {
    const conflict = {
      table: 'sets' as const,
      rowId: 'set-1',
      keptVersion: { rev: 2, updatedAt: NOW, deletedAt: null, values: {} },
      discardedVersion: { rev: 1, updatedAt: NOW - 1, deletedAt: null, values: {} },
      at: NOW,
    };
    const service = {
      pass: async () => ({
        status: 'completed' as const,
        pushed: 2,
        pulled: 1,
        conflicts: 1,
        failures: [{ stage: 'pull' as const, table: 'sets' as const, message: 'sin red' }],
        startedAt: NOW,
        finishedAt: NOW,
      }),
      pendingCount: async () => ({ ok: true as const, value: 4 }),
      listConflicts: async () => ({ ok: true as const, value: [conflict] }),
    } as unknown as SyncService;

    const engine = engineOf(service);
    // Las etapas viajan con el resumen: son lo único que permite decir *dónde* falló.
    expect(await engine.pass()).toEqual({
      status: 'completed',
      failures: 1,
      stages: ['pull'],
    });
    expect(await engine.pendingCount()).toBe(4);
    expect(await engine.conflictCount()).toBe(1);
  });

  it('turns an unreadable queue into a rejection, so the state machine can say `error`', async () => {
    const service = {
      pass: async () => ({
        status: 'completed' as const,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        failures: [],
        startedAt: NOW,
        finishedAt: NOW,
      }),
      pendingCount: async () => ({ ok: false as const, error: 'la cola no se puede leer' }),
      listConflicts: async () => ({ ok: false as const, error: 'la cola no se puede leer' }),
    } as unknown as SyncService;

    const engine = engineOf(service);
    await expect(engine.pendingCount()).rejects.toThrow('la cola no se puede leer');
    expect(await engine.conflictCount()).toBe(0);
  });
});

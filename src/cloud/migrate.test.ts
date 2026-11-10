/**
 * La migración del historial — odd/tasks/cloud-sync.md T6/L7, spec S7.
 *
 * Lo que estas pruebas defienden, una por una, es lo que se pierde en silencio:
 *
 * - un sello con "ahora" en vez del instante de la fila, que reordena la historia y
 *   falsea la fusión de una tabla mutable;
 * - una segunda ejecución que vuelve a encolar (el servidor recibiría el doble);
 * - una ejecución interrumpida que no se reanuda, o que reanuda duplicando;
 * - una migración que para subir limpia el dispositivo (S7: «No borrar datos originales»).
 *
 * El almacén es un doble en memoria que imita exactamente lo que `SyncStoragePort`
 * promete: una fila por clave, `listSyncRows` filtrando por `updatedAt`, y la cola con
 * la identidad `tabla:filaId:rev`. Nada toca IndexedDB.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import { createStorage, type IndexedDbStorage } from '../storage';
import type { OutboxOp, SyncTable } from './types';
import type { StoredSyncRow, SyncMeta, SyncStoragePort } from '../storage';
import {
  HISTORY_TABLES,
  MIGRATION_REV,
  MARKER_DONE,
  browserMarkers,
  markerKey,
  memoryMarkers,
  migrateHistory,
  type MigrationMarkerStore,
} from './migrate';

const NOW = 1_760_000_000_000;
/** El instante del marcador de arranque: anterior a la cuenta, y el de las filas de config. */
const MARKER_AT = 1_759_000_000_000;

const SESSION_DATE = 1_759_500_000_000;
const MEASURED_AT = 1_759_600_000_000;
const ACTIVITY_AT = 1_759_700_000_000;
const SET_AT = 1_759_550_000_000;

const UNKNOWN: SyncMeta = { rev: 0, updatedAt: 0, deletedAt: null };

/** Un almacén con las diez tablas y la cola, en Mapas. */
interface FakeStorage extends SyncStoragePort {
  readonly rows: Map<string, StoredSyncRow>;
  readonly ops: Map<string, OutboxOp>;
  /** Tablas cuyo recorrido lanza, para probar la reanudación tras un fallo. */
  readonly broken: Set<SyncTable>;
}

function keyOf(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

/** Las dos tablas de una sola fila: su id es la clave fija de `meta`. */
const META_KEYS: Partial<Record<SyncTable, string>> = {
  profiles: 'profile',
  phase_state: 'phaseState',
};

function fakeStorage(seed: readonly StoredSyncRow[] = []): FakeStorage {
  const rows = new Map<string, StoredSyncRow>();
  for (const row of seed) rows.set(keyOf(row.table, row.id), row);
  const ops = new Map<string, OutboxOp>();
  const broken = new Set<SyncTable>();

  const queue: ReturnType<SyncStoragePort['queue']> = {
    allOps: () => Promise.resolve([...ops.values()].map((op) => ({ ...op }))),
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
    rows,
    ops,
    broken,

    readSyncRow(table, id) {
      return Promise.resolve(rows.get(keyOf(table, id)));
    },

    listSyncRows(table, since) {
      if (broken.has(table)) return Promise.reject(new Error(`no se puede leer ${table}`));
      return Promise.resolve(
        [...rows.values()]
          .filter((row) => row.table === table && row.sync.updatedAt > since)
          .sort((left, right) => left.sync.updatedAt - right.sync.updatedAt),
      );
    },

    applySyncRow(table, row) {
      rows.set(keyOf(table, row.id), { ...row });
      return Promise.resolve();
    },

    readPushWatermark: () => Promise.resolve(null),
    writePushWatermark: () => Promise.resolve(),
    queue: () => queue,
  };
}

function row(
  table: SyncTable,
  id: string,
  record: Readonly<Record<string, unknown>>,
  sync: SyncMeta = UNKNOWN,
): StoredSyncRow {
  return { table, id, sync, record };
}

/** Las filas que el dueño ya tenía antes de crear la cuenta: sin sello. */
function preAccountStore(): FakeStorage {
  return fakeStorage([
    row('profiles', 'profile', {
      key: 'profile',
      value: { displayName: 'Robert', massUnit: 'kg', weeklyTrainingDays: 4 },
    }),
    row('plan_days', 'day-a', { id: 'day-a', name: 'Día A', order: 0 }),
    row('plan_items', 'item-1', { id: 'item-1', planDayId: 'day-a', order: 0 }),
    row('exercises', 'ex-1', { id: 'ex-1', name: 'Sentadilla' }, { rev: 2, updatedAt: 900, deletedAt: null }),
    row('sessions', 'session-1', { id: 'session-1', planDayId: 'day-a', scheduledDate: SESSION_DATE }),
    row('session_exercises', 'es-1', { id: 'es-1', sessionId: 'session-1', sessionDate: SESSION_DATE }),
    row('sets', 'set-1', { id: 'set-1', exerciseSessionId: 'es-1', confirmedAt: SET_AT }),
    row('body_measurements', 'measure-1', { id: 'measure-1', date: MEASURED_AT, weightKg: 78 }),
    row('activities', 'activity-1', { id: 'activity-1', date: ACTIVITY_AT, kind: 'walk' }),
  ]);
}

function migrate(storage: FakeStorage, markers: MigrationMarkerStore = memoryMarkers()) {
  return migrateHistory({ storage, markers, account: 'rober@example.com', markerAt: MARKER_AT });
}

function opsOf(storage: FakeStorage, table: SyncTable): readonly OutboxOp[] {
  return [...storage.ops.values()].filter((op) => op.table === table);
}

describe('migrateHistory: el sello sale de la fila', () => {
  it('sella la sesión con su `scheduledDate`, no con "ahora"', async () => {
    const storage = preAccountStore();
    const report = await migrate(storage);

    expect(report.status).toBe('completed');
    const stored = storage.rows.get(keyOf('sessions', 'session-1'));
    expect(stored?.sync).toEqual({ rev: MIGRATION_REV, updatedAt: SESSION_DATE, deletedAt: null });
    expect(stored?.sync.updatedAt).not.toBe(NOW);
    expect(opsOf(storage, 'sessions')).toEqual([
      expect.objectContaining({ id: 'sessions:session-1:1', rowId: 'session-1', rev: 1, op: 'upsert' }),
    ]);
  });

  it('sella los pesajes y las actividades con su `date`', async () => {
    const storage = preAccountStore();
    await migrate(storage);

    expect(storage.rows.get(keyOf('body_measurements', 'measure-1'))?.sync.updatedAt).toBe(
      MEASURED_AT,
    );
    expect(storage.rows.get(keyOf('activities', 'activity-1'))?.sync.updatedAt).toBe(ACTIVITY_AT);
  });

  it('sella los ejercicios de sesión con `sessionDate` y las series con `confirmedAt`', async () => {
    const storage = preAccountStore();
    await migrate(storage);

    expect(storage.rows.get(keyOf('session_exercises', 'es-1'))?.sync.updatedAt).toBe(SESSION_DATE);
    expect(storage.rows.get(keyOf('sets', 'set-1'))?.sync.updatedAt).toBe(SET_AT);
  });

  it('sella perfil, plan y fase con el instante del marcador de arranque', async () => {
    const storage = preAccountStore();
    await migrate(storage);

    for (const [table, id] of [
      ['profiles', 'profile'],
      ['plan_days', 'day-a'],
      ['plan_items', 'item-1'],
    ] as const) {
      expect(storage.rows.get(keyOf(table, id))?.sync.updatedAt).toBe(MARKER_AT);
    }
  });

  it('no toca un id ni un solo valor del historial', async () => {
    const storage = preAccountStore();
    const before = new Map([...storage.rows].map(([key, value]) => [key, value.record]));
    await migrate(storage);

    expect([...storage.rows.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, record] of before) expect(storage.rows.get(key)?.record).toEqual(record);
  });

  it('no renumera una fila que ya tenía su propia revisión', async () => {
    const storage = preAccountStore();
    await migrate(storage);

    expect(storage.rows.get(keyOf('exercises', 'ex-1'))?.sync.rev).toBe(2);
    expect(opsOf(storage, 'exercises')).toEqual([]);
  });
});

describe('migrateHistory: el informe', () => {
  it('cuenta sesiones, pesajes y actividades', async () => {
    const storage = preAccountStore();
    const report = await migrate(storage);

    expect(report.counts).toEqual({ sessions: 1, measurements: 1, activities: 1 });
    expect(report.queued).toBe(8);
    expect(report.stamped).toBe(8);
    expect(report.error).toBeNull();
  });

  it('dice `idle` cuando no había nada anterior a la cuenta', async () => {
    const storage = fakeStorage();
    const report = await migrate(storage);

    expect(report.status).toBe('idle');
    expect(report.queued).toBe(0);
    expect(storage.ops.size).toBe(0);
  });

  it('un fallo es un valor, no una excepción, y lo ya hecho se conserva', async () => {
    const storage = preAccountStore();
    storage.broken.add('sets');
    const report = await migrate(storage);

    expect(report.status).toBe('failed');
    expect(report.error).toContain('sets');
    // Las tablas anteriores a la rota sí se migraron, y siguen migradas.
    expect(report.queued).toBe(7);
    expect(storage.rows.get(keyOf('sessions', 'session-1'))?.sync.rev).toBe(MIGRATION_REV);
    expect(storage.rows.get(keyOf('sets', 'set-1'))?.sync.rev).toBe(0);
  });
});

describe('migrateHistory: una vez, nunca dos', () => {
  it('la segunda ejecución no encola nada cuando la primera ya subió', async () => {
    const storage = preAccountStore();
    const markers = memoryMarkers();
    await migrate(storage, markers);
    const queued = storage.ops.size;

    // La pasada de sincronización vacía la cola: el paso queda cerrado.
    storage.ops.clear();
    const second = await migrate(storage, markers);

    expect(second.status).toBe('idle');
    expect(second.queued).toBe(0);
    expect(storage.ops.size).toBe(0);
    expect(queued).toBe(8);
    for (const table of HISTORY_TABLES) {
      expect(markers.read(markerKey('rober@example.com', table))).toBe(MARKER_DONE);
    }
  });

  it('la segunda ejecución no duplica aunque el marcador se haya perdido', async () => {
    const storage = preAccountStore();
    await migrate(storage, memoryMarkers());
    storage.ops.clear();

    // Otro navegador, otro `localStorage`: los marcadores no están, las filas sí.
    const second = await migrate(storage, memoryMarkers());

    expect(second.queued).toBe(0);
    expect(storage.ops.size).toBe(0);
  });

  it('reanuda una ejecución interrumpida sin repetir lo encolado', async () => {
    const storage = preAccountStore();
    const markers = memoryMarkers();

    // La caída: una op encolada y sellada, la segunda fila de la tabla sin sellar.
    storage.ops.set('profiles:profile:1', {
      id: 'profiles:profile:1',
      table: 'profiles',
      rowId: 'profile',
      op: 'upsert',
      rev: MIGRATION_REV,
      queuedAt: MARKER_AT,
      attempts: 0,
      lastError: null,
    });
    await storage.applySyncRow('profiles', {
      table: 'profiles',
      id: 'profile',
      sync: { rev: MIGRATION_REV, updatedAt: MARKER_AT, deletedAt: null },
      record: { key: 'profile', value: { displayName: 'Robert' } },
    });
    const survivor = row('activities', 'activity-2', { id: 'activity-2', date: ACTIVITY_AT + 10 });
    storage.rows.set(keyOf('activities', 'activity-2'), survivor);

    const resumed = await migrate(storage, markers);

    // Nada duplicado: la op del perfil sigue siendo una, con su misma identidad.
    expect([...storage.ops.values()].filter((op) => op.table === 'profiles')).toHaveLength(1);
    expect(storage.ops.get('profiles:profile:1')?.rev).toBe(MIGRATION_REV);
    // Y lo que faltaba sí se hizo.
    expect(storage.rows.get(keyOf('activities', 'activity-2'))?.sync.updatedAt).toBe(ACTIVITY_AT + 10);
    expect(resumed.counts.activities).toBe(2);
    expect(resumed.counts.sessions).toBe(1);
  });

  it('reanuda sin perder lo que quedaba de una tabla a medias', async () => {
    // Un fallo de lectura en mitad de la tabla deja las filas siguientes sin sellar; la
    // siguiente ejecución las ve y las encola, sin tocar lo que ya entró.
    const storage = fakeStorage([
      row('body_measurements', 'measure-1', { id: 'measure-1', date: MEASURED_AT }),
      row('body_measurements', 'measure-2', { id: 'measure-2', date: MEASURED_AT + 1 }),
    ]);
    storage.broken.add('body_measurements');
    const broken = await migrate(storage);

    expect(broken.status).toBe('failed');
    expect(storage.ops.size).toBe(0);

    storage.broken.clear();
    const resumed = await migrate(storage);

    expect(resumed.counts.measurements).toBe(2);
    expect([...storage.ops.values()].filter((op) => op.rowId === 'measure-1')).toHaveLength(1);
    expect([...storage.ops.values()].filter((op) => op.rowId === 'measure-2')).toHaveLength(1);
  });
});

/* ------------------------------------------- sobre el almacén de verdad (IndexedDB) */

/**
 * El doble de arriba dice lo que `SyncStoragePort` promete; este bloque comprueba que el
 * almacén real lo cumple, que es donde el detalle muerde: una fila escrita antes de que
 * existieran las columnas de sincronización está sellada con `updatedAt: 0`, y el perfil
 * vive en `meta` **junto a la propia cola**. Si la migración leyera una tabla de una sola
 * fila recorriendo su almacén, sellaría una op como si fuera el perfil; si leyera
 * `updatedAt > 0`, no vería nada que migrar.
 */
describe('migrateHistory: sobre IndexedDB', () => {
  let storage: IndexedDbStorage;

  beforeEach(async () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(fakeIndexedDb)) globals[name] = value;
    const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
    globals['indexedDB'] = factory;

    storage = createStorage({ dbName: 'rupfit-migrate-test', now: () => NOW });
    await storage.open();
  });

  afterEach(() => {
    storage.close();
  });

  /** Una fila escrita antes de la cuenta: sin `rev`, sin `updatedAt`, sin historia. */
  async function seed(table: SyncTable, id: string, record: Record<string, unknown>) {
    await storage.sync.applySyncRow(table, {
      table,
      id,
      sync: { rev: 0, updatedAt: 0, deletedAt: null },
      record,
    });
  }

  it('sella y encola el historial que ya estaba, sin borrar ni renombrar nada', async () => {
    await seed('profiles', 'profile', {
      value: { displayName: 'Robert', massUnit: 'kg', weeklyTrainingDays: 4 },
    });
    await seed('sessions', 'session-1', {
      id: 'session-1',
      planDayId: 'day-a',
      dayNameSnapshot: 'Día A',
      scheduledDate: SESSION_DATE,
      startedAt: null,
      endedAt: null,
      phase: { kind: 'normal' },
      status: 'scheduled',
      deletionPending: false,
    });
    await seed('body_measurements', 'measure-1', {
      id: 'measure-1',
      date: MEASURED_AT,
      weightKg: 78,
      provenance: 'manual',
    });

    const markers = memoryMarkers();
    const report = await migrateHistory({
      storage: storage.sync,
      markers,
      account: 'rober@example.com',
      markerAt: MARKER_AT,
    });

    expect(report.status).toBe('completed');
    expect(report.counts).toEqual({ sessions: 1, measurements: 1, activities: 0 });

    // El sello sale de la fila: la sesión de `scheduledDate`, el pesaje de `date`.
    expect((await storage.sync.readSyncRow('sessions', 'session-1'))?.sync).toEqual({
      rev: MIGRATION_REV,
      updatedAt: SESSION_DATE,
      deletedAt: null,
    });
    expect((await storage.sync.readSyncRow('body_measurements', 'measure-1'))?.sync.updatedAt).toBe(
      MEASURED_AT,
    );
    // Y el perfil sigue siendo el perfil, no una op de la cola que comparte `meta`.
    expect((await storage.profile.read())?.displayName).toBe('Robert');

    // Nada se borra: la sesión sigue leyéndose por la API de la app.
    expect((await storage.sessions.byId('session-1'))?.id).toBe('session-1');

    // Una op por fila, con la identidad de la cola.
    const ops = await storage.sync.queue().allOps();
    expect(ops.map((op) => op.id).sort()).toEqual([
      'body_measurements:measure-1:1',
      'profiles:profile:1',
      'sessions:session-1:1',
    ]);

    // Y la segunda ejecución no añade ni una.
    const second = await migrateHistory({
      storage: storage.sync,
      markers,
      account: 'rober@example.com',
      markerAt: MARKER_AT,
    });
    expect(second.queued).toBe(0);
    expect(await storage.sync.queue().allOps()).toHaveLength(3);
  });
});

describe('browserMarkers', () => {
  it('lee y escribe sin `localStorage`, cayendo en memoria', () => {
    const markers = browserMarkers();
    markers.write(markerKey('a@b.c', 'sessions'), MARKER_DONE);
    expect(markers.read(markerKey('a@b.c', 'sessions'))).toBe(MARKER_DONE);
    expect(markers.read(markerKey('otro@b.c', 'sessions'))).toBeNull();
  });
});

/** El instante de la fila nunca es el de la migración, que es lo que el sello significa. */
describe('migrateHistory: el sello es anterior a la cuenta', () => {
  it('no usa el reloj: todos los instantes vienen de los datos', async () => {
    const storage = preAccountStore();
    await migrate(storage);

    for (const stored of storage.rows.values()) {
      // Los ejercicios ya tenían su propio `updatedAt` (900) antes de la cuenta.
      expect(stored.sync.updatedAt).toBeLessThan(NOW);
    }
  });
});

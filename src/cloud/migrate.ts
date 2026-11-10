/**
 * La migración del historial que existía antes de la cuenta — odd/tasks/cloud-sync.md
 * T6 y el procedimiento L7, spec S7.
 *
 * El problema que resuelve es pequeño y total: las filas que el dispositivo ya tenía se
 * escribieron cuando no había cuenta, así que ningún repositorio encoló nada. La cola
 * está vacía y una pasada de sincronización sube cero filas aunque el almacén tenga un
 * plan entero. Esta migración sella esas filas y encola su subida, una vez por cuenta.
 *
 * Las cinco reglas de L7, y dónde vive cada una en este archivo:
 *
 * 1. **Sellar, no reescribir.** `instantOf` deriva el instante de la propia fila (la
 *    sesión de `scheduledDate`, el pesaje y la actividad de `date`) y cae en el instante
 *    del marcador de arranque solo cuando la fila no tiene ninguno — perfil, plan, fase
 *    y ejercicios. Ni un `id` se toca: el historial sigue unido a su sesión y a su
 *    ejercicio, y el registro se escribe exactamente como estaba (`row.record`).
 * 2. **Encolar una sola vez.** La op es `tabla:filaId:rev`, la misma identidad que usa la
 *    cola para todo lo demás, así que reofrecerla reemplaza el registro en lugar de
 *    añadir un segundo.
 * 3. **Reanudable por diseño.** Primero la cola, después el sello: una caída entre las
 *    dos deja una op que la siguiente ejecución reofrece con el mismo id, nunca una fila
 *    sellada sin nada que enviar. Y el paso `migration:<cuenta>:<tabla>` solo queda
 *    cerrado cuando la cola de ese paso quedó vacía.
 * 4. **Idempotente en el servidor.** El `upsert` por `id` con `user_id` del token hace
 *    que una segunda subida de la misma fila sea la misma fila.
 * 5. **Nada se borra.** Aquí no hay un solo `delete`: subir no limpia el dispositivo.
 *
 * Una desviación consciente, y por qué no cuesta nada: el marcador de paso vive en el
 * `localStorage` del navegador, no en el almacén `meta`. `meta` no es alcanzable desde
 * esta superficie (la cola y el almacén exponen operaciones con nombre, no un
 * diccionario), y la corrección **no depende** del marcador: la garantía real es el
 * `rev` de la propia fila. Si el marcador se pierde, la migración vuelve a recorrer las
 * tablas, no encuentra ninguna fila sin sellar y no encola nada.
 *
 * Nada de esto lanza: un fallo es un `MigrationReport` con `status: 'failed'` y una
 * frase, porque la tarjeta de cuenta tiene que poder pintarlo y el entreno no puede
 * esperar a nada de aquí.
 */

import {
  pendingOp,
  tableTarget,
  type EpochMs,
  type StoredSyncRow,
  type SyncStoragePort,
} from '../storage';
import { SYNC_TABLES, errorMessage, type SyncTable } from './types';

/** La revisión con la que se sella cada fila anterior a la cuenta. Nunca renumera nada. */
export const MIGRATION_REV = 1;

/** Las tres tablas de las que se le dice al dueño cuántas subieron (L7 §5). */
export const HISTORY_TABLES = ['sessions', 'body_measurements', 'activities'] as const;

export type HistoryTable = (typeof HISTORY_TABLES)[number];

/**
 * El instante propio de cada fila. Las cinco tablas de historial lo llevan dentro; las
 * de configuración (perfil, plan, fase, ejercicios) no tienen ninguno, y por eso L7 les
 * da el del marcador de arranque, que es lo único que saben de sí mismas.
 */
const DOMAIN_INSTANT: Partial<Record<SyncTable, string>> = {
  sessions: 'scheduledDate',
  session_exercises: 'sessionDate',
  sets: 'confirmedAt',
  body_measurements: 'date',
  activities: 'date',
};

/* ------------------------------------------------------------------- marcador */

/**
 * El estado de un paso. Un paso es una tabla, y solo hay dos estados posibles: sin
 * marcar (hay que mirarla) y `done` (sellada y con su cola vacía).
 */
export interface MigrationMarkerStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** `migration:<cuenta>:<paso>`, la forma que fija L7 §3. */
export const MARKER_PREFIX = 'migration:';
export const MARKER_DONE = 'done';

export function markerKey(account: string, step: string): string {
  return `${MARKER_PREFIX}${account}:${step}`;
}

/** El marcador de un test, y el de un navegador que no deja escribir `localStorage`. */
export function memoryMarkers(): MigrationMarkerStore {
  const written = new Map<string, string>();
  return {
    read: (key) => written.get(key) ?? null,
    write: (key, value) => {
      written.set(key, value);
    },
  };
}

/**
 * El marcador real. `localStorage` y no `meta` (ver la cabecera): puede fallar, y fallar
 * aquí solo cuesta un recorrido de más. Un navegador sin `localStorage` cae en memoria.
 */
export function browserMarkers(): MigrationMarkerStore {
  const fallback = memoryMarkers();

  function storage(): Storage | null {
    try {
      const candidate = globalThis.localStorage as Storage | undefined;
      return candidate ?? null;
    } catch {
      return null;
    }
  }

  return {
    read(key) {
      try {
        const store = storage();
        return store === null ? fallback.read(key) : store.getItem(key);
      } catch {
        return fallback.read(key);
      }
    },
    write(key, value) {
      try {
        const store = storage();
        if (store === null) {
          fallback.write(key, value);
          return;
        }
        store.setItem(key, value);
      } catch {
        fallback.write(key, value);
      }
    },
  };
}

/* ------------------------------------------------------------------- informe */

/** Lo que la tarjeta dice: «N sesiones, M pesajes, K actividades subidas». */
export interface MigrationCounts {
  readonly sessions: number;
  readonly measurements: number;
  readonly activities: number;
}

export interface MigrationReport {
  /**
   * `completed` — filas selladas y encoladas en esta ejecución (todas o algunas).
   * `idle` — no había nada anterior a la cuenta, o ya estaba hecho.
   * `failed` — una tabla no se pudo leer o escribir; lo hecho se conserva y se reanuda.
   */
  readonly status: 'completed' | 'idle' | 'failed';
  readonly counts: MigrationCounts;
  /** Filas selladas y ops encoladas en esta ejecución, contando las diez tablas. */
  readonly stamped: number;
  readonly queued: number;
  /**
   * La frase del fallo, como dato y no como excepción. Cuánto falta por subir no está
   * aquí: la tarjeta lee la cola en vivo después de la pasada, que es el único número que
   * no puede quedarse viejo.
   */
  readonly error: string | null;
}

export interface MigrateHistoryOptions {
  readonly storage: SyncStoragePort;
  readonly markers: MigrationMarkerStore;
  /** La cuenta en uso. `AuthState` no lleva el uuid, así que la clave es su correo. */
  readonly account: string;
  /** El instante del marcador de arranque: lo único que saben de sí las filas de config. */
  readonly markerAt: EpochMs;
}

/** El nombre que la tarjeta usa para cada tabla de historial (L7 §5). */
const COUNT_FIELD: Readonly<Record<HistoryTable, keyof MigrationCounts>> = {
  sessions: 'sessions',
  body_measurements: 'measurements',
  activities: 'activities',
};

function isHistory(table: SyncTable): table is HistoryTable {
  return (HISTORY_TABLES as readonly SyncTable[]).includes(table);
}

/**
 * El instante de una fila: el suyo, o el del marcador de arranque cuando no tiene.
 * Un valor ausente o imposible no inventa un "ahora": cae en el marcador, que es anterior
 * a la cuenta y por tanto nunca gana una comparación de fusión contra un cambio real.
 */
function instantOf(
  table: SyncTable,
  record: Readonly<Record<string, unknown>>,
  markerAt: EpochMs,
): EpochMs {
  const field = DOMAIN_INSTANT[table];
  const value = field === undefined ? undefined : record[field];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : markerAt;
}

/**
 * Las filas de una tabla, selladas o no.
 *
 * Las dos tablas de una sola fila viven en `meta`, junto a la propia cola: recorrer ese
 * almacén devolvería cada op y cada marca como si fuera la fila del perfil, así que se
 * leen por su clave fija. Las otras ocho se recorren con `since = -1`, porque una fila
 * escrita antes de la cuenta está sellada con `updatedAt: 0` y `updatedAt > 0` escondería
 * justo las filas que esta migración busca.
 */
async function rowsOf(
  storage: SyncStoragePort,
  table: SyncTable,
): Promise<readonly StoredSyncRow[]> {
  const target = tableTarget(table);
  if (target.metaKey !== null) {
    const row = await storage.readSyncRow(table, target.metaKey);
    return row === undefined ? [] : [row];
  }
  return storage.listSyncRows(table, -1);
}

/** Una fila sin sello. Un tombstone sin sello no existe en la práctica; si aparece, se
 *  deja tal cual en lugar de resucitarlo como `upsert`. */
function isUnstamped(row: StoredSyncRow): boolean {
  return row.sync.rev < MIGRATION_REV && row.sync.deletedAt === null;
}

/**
 * Las tablas que aún tienen algo en la cola. Un paso no puede cerrarse mientras su tabla
 * tenga una op esperando (L7 §3), y una cola ilegible no cierra ninguno.
 */
async function pendingTables(storage: SyncStoragePort): Promise<ReadonlySet<SyncTable> | null> {
  try {
    return new Set((await storage.queue().allOps()).map((op) => op.table));
  } catch {
    return null;
  }
}

/**
 * La migración, entera, con el resultado como valor. Nunca lanza y nunca borra.
 *
 * El orden dentro de una tabla importa y es el de L7: las ops entran en la cola en una
 * sola escritura y solo después se sellan las filas, una a una, con el mismo `rev` y el
 * mismo instante que llevó su op. Una interrupción en cualquier punto deja o bien una op
 * huérfana que la siguiente ejecución reofrece con su misma identidad, o bien filas ya
 * selladas que nadie vuelve a encolar.
 */
export async function migrateHistory(options: MigrateHistoryOptions): Promise<MigrationReport> {
  const { storage, markers, account, markerAt } = options;
  const counts: Record<keyof MigrationCounts, number> = {
    sessions: 0,
    measurements: 0,
    activities: 0,
  };
  let stamped = 0;
  let queued = 0;
  let error: string | null = null;
  const pending = await pendingTables(storage);

  const close = (table: SyncTable): void => {
    try {
      markers.write(markerKey(account, table), MARKER_DONE);
    } catch {
      // Un marcador que no se puede escribir cuesta un recorrido de más, nada más.
    }
  };

  for (const table of SYNC_TABLES) {
    if (markers.read(markerKey(account, table)) === MARKER_DONE) continue;

    try {
      const fresh = (await rowsOf(storage, table)).filter(isUnstamped);
      if (fresh.length === 0) {
        // Nada sin sellar: el paso se cierra si además su cola quedó vacía.
        if (pending !== null && !pending.has(table)) close(table);
        continue;
      }

      const ops = fresh.map((row) =>
        pendingOp({
          table,
          rowId: row.id,
          op: 'upsert',
          rev: MIGRATION_REV,
          at: instantOf(table, row.record, markerAt),
        }),
      );

      await storage.queue().putOps(ops);
      queued += ops.length;

      for (const [index, op] of ops.entries()) {
        const row = fresh[index];
        if (row === undefined) continue;
        await storage.applySyncRow(table, {
          table,
          id: row.id,
          sync: { rev: MIGRATION_REV, updatedAt: op.queuedAt, deletedAt: null },
          record: row.record,
        });
        stamped += 1;
        if (isHistory(table)) counts[COUNT_FIELD[table]] += 1;
      }
    } catch (cause) {
      // Lo que ya entró se queda; la siguiente pasada reanuda por donde iba. Una tabla
      // rota no impide migrar las demás, que es lo que necesita el historial de después.
      error ??= `${table}: ${errorMessage(cause)}`;
      continue;
    }
  }

  return {
    status: error !== null ? 'failed' : stamped === 0 && queued === 0 ? 'idle' : 'completed',
    counts,
    stamped,
    queued,
    error,
  };
}

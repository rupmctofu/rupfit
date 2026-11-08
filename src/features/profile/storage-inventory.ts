/**
 * What Perfil says about the stored data — docs/data-model.md §11, design-system §2.5,
 * Q-4.
 *
 * Three honest limits decide this module:
 *
 * - The browser may refuse to say how much space the app uses (`navigator.storage
 *   .estimate()` is not guaranteed), so "unknown" is `null` and never rendered as a
 *   zero (§1.6).
 * - WebKit does not implement `navigator.storage.persist()`, so the answer to Q-4 is
 *   "cannot be asked", which is not the same as "refused".
 * - The store is not the backup. The export of FR-16.3 is the only durable copy (§11),
 *   and the screen has to say so in one sentence.
 */

import type { StorageAnswer } from '../../storage';

/** What a read pass counts. Only used to describe storage; never a stored aggregate (I-6). */
export interface DataSnapshot {
  readonly hasProfile: boolean;
  readonly sessions: number;
  readonly exercises: number;
  readonly customExercises: number;
  readonly planDays: number;
  readonly measurements: number;
  readonly activities: number;
}

export interface InventoryRow {
  readonly label: string;
  readonly value: string;
}

/**
 * How many sessions the screen reads to count them. A count is not a statistic of the
 * domain; it is the size of the store, so past this many the screen says "o más"
 * rather than pretend it counted every row.
 */
export const SESSION_READ_LIMIT = 200;

const UNITS = ['B', 'kB', 'MB', 'GB'] as const;
/** Decimal, like the Files app: a storage figure the owner can compare with Settings. */
const STEP = 1000;

/** `512 B`, `1,5 kB`, `124 kB`, `1,2 MB` — comma decimals, one decimal below ten. */
export function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let value = safe;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }

  const name = UNITS[unit] ?? 'B';
  if (unit === 0) return `${Math.round(value)} B`;

  const text = value < 10 ? value.toFixed(1).replace('.', ',') : String(Math.round(value));
  return `${text} ${name}`;
}

export interface UsageEstimate {
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

/** A sentence with a subject, so it reads on its own: the app has no other size to give. */
export function storageUsageLine(estimate: UsageEstimate): string {
  const usage = estimate.usageBytes;
  if (usage === null) return 'El navegador no informa del espacio que ocupan los datos.';

  const used = `Los datos ocupan ${formatBytes(usage)}`;
  return estimate.quotaBytes === null
    ? `${used}.`
    : `${used} de los ${formatBytes(estimate.quotaBytes)} de cuota.`;
}

/**
 * Q-4, as a sentence that stands alone: `null` is "the API is absent", never "the
 * browser said no" (§1.6) — the distinction WebKit makes every day.
 */
export function persistenceLine(answer: StorageAnswer | null): string {
  if (answer === null || answer.persisted === null) {
    return 'No se puede pedir almacenamiento persistente: este navegador no lo implementa.';
  }
  return answer.persisted
    ? 'Almacenamiento persistente concedido.'
    : 'El navegador no ha concedido el almacenamiento persistente.';
}

/**
 * The list of what is kept. Absence is stated as absence ("Ninguna"), never as a zero
 * that would read like a real history with nothing in it.
 */
export function storageInventory(snapshot: DataSnapshot): readonly InventoryRow[] {
  return [
    { label: 'Perfil y objetivos', value: snapshot.hasProfile ? 'Guardado' : 'Sin crear' },
    {
      label: 'Rutina semanal',
      value: snapshot.planDays === 0 ? 'Sin días' : `${snapshot.planDays} ${snapshot.planDays === 1 ? 'día' : 'días'}`,
    },
    {
      label: 'Ejercicios',
      value:
        snapshot.exercises === 0
          ? 'Ninguno'
          : snapshot.customExercises > 0
            ? `${snapshot.exercises} · ${snapshot.customExercises} propios`
            : `${snapshot.exercises}`,
    },
    {
      label: 'Sesiones y series',
      value:
        snapshot.sessions === 0
          ? 'Ninguna'
          : snapshot.sessions >= SESSION_READ_LIMIT
            ? `${SESSION_READ_LIMIT} o más`
            : `${snapshot.sessions}`,
    },
    {
      label: 'Pesos corporales',
      value: snapshot.measurements === 0 ? 'Ninguno' : `${snapshot.measurements}`,
    },
    { label: 'Actividades', value: snapshot.activities === 0 ? 'Ninguna' : `${snapshot.activities}` },
  ];
}

/**
 * True when nothing the owner created is stored. The exercise library is excluded on
 * purpose: §10 reseeds it, so a reset store is not "populated" merely because the
 * library came back.
 */
export function isEmptySnapshot(snapshot: DataSnapshot): boolean {
  return (
    !snapshot.hasProfile &&
    snapshot.sessions === 0 &&
    snapshot.planDays === 0 &&
    snapshot.measurements === 0 &&
    snapshot.activities === 0
  );
}

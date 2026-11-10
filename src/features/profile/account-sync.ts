/**
 * The five sync states of spec S8, in the words the account card prints.
 *
 * The sync engine is a separate module, written in parallel: nothing here imports it.
 * The card receives an `AccountSyncView` and this file turns it into a state word, a
 * detail line and whether the owner can ask for another attempt. S8 names the states —
 * sincronizado, sin conexión, sincronizando, cambios pendientes, error — and also asks
 * for the number of pending changes and the last successful sync, which is why the
 * count lives inside the word and the moment has its own line.
 *
 * The default view is `sin conexión` with zero pending changes: it is what an app with
 * no engine yet, or a build with no project, should honestly say.
 */

import type { EpochMs } from '../../storage';

/** S8's five states. `pending` is a state, not a number: the count is its word. */
export type SyncPhase = 'synced' | 'offline' | 'syncing' | 'pending' | 'failed';

/**
 * Por dónde se rompió una sincronización que se rompió.
 *
 * Cuatro palabras, y cada una llega desde un valor capturado de verdad, nunca de una
 * suposición: `migration` cuando el historial no se pudo preparar, `queue` cuando la cola
 * de este dispositivo no se pudo leer, `remote` cuando el servicio registró un fallo en
 * el envío o en la bajada, `network` cuando no hubo respuesta — ni un error, ni un dato —
 * dentro del presupuesto de la pasada. `null` es «falló y no sabemos dónde», y entonces
 * la tarjeta dice la frase genérica en lugar de inventarse un culpable.
 */
export type SyncFailReason = 'queue' | 'migration' | 'remote' | 'network';

/**
 * La migración del historial que había antes de la cuenta (odd/tasks/cloud-sync.md L7,
 * spec S7). La tarjeta cuenta lo que la migración hizo; no lo deduce.
 */
export interface MigratedHistory {
  readonly sessions: number;
  readonly measurements: number;
  readonly activities: number;
  /** `true` cuando la migración paró en un error: lo hecho se conserva y se reanuda. */
  readonly failed: boolean;
}

/**
 * Everything the card needs to draw the sync half of the account, fed by one prop.
 * `onSync` and `onRetry` are optional because a view with no engine behind it must
 * still render — the actions then say so by being disabled.
 */
export interface AccountSyncView {
  readonly phase: SyncPhase;
  /** How many local changes are waiting in the outbox. */
  readonly pendingCount: number;
  /** The last successful sync, or `null` when there has never been one. */
  readonly lastSyncedAt: EpochMs | null;
  /**
   * La migración del historial de esta cuenta, o `null`/ausente cuando no había nada que
   * migrar (una instalación nueva no tiene nada que contar).
   */
  readonly migrated?: MigratedHistory | null | undefined;
  /**
   * Por dónde se rompió, cuando la fase es `failed`. Ausente o `null` = no se sabe, y la
   * tarjeta no acusa a nadie en concreto.
   */
  readonly reason?: SyncFailReason | null | undefined;
  /** `Sincronizar ahora`. */
  readonly onSync?: (() => void) | undefined;
  /** `Reintentar`, on an error. */
  readonly onRetry?: (() => void) | undefined;
}

/** What this build shows until the sync engine passes its own view. */
export const NO_SYNC: AccountSyncView = {
  phase: 'offline',
  pendingCount: 0,
  lastSyncedAt: null,
};

/** The tone of the state word. Colour never carries the meaning alone (§9). */
export type SyncTone = 'muted' | 'success' | 'accent';

export interface SyncStateWords {
  /** `Sincronizado`, `3 cambios pendientes`, `Error de sincronización`… */
  readonly word: string;
  /** One honest sentence under the word, or `null` when the word is enough. */
  readonly detail: string | null;
  readonly tone: SyncTone;
  /** Whether `Reintentar` is offered (S8's error indicator). */
  readonly retry: boolean;
}

const PENDING_DETAIL = 'Se subirán solos en cuanto haya conexión. No hace falta hacer nada.';

/**
 * Una frase por motivo, corta y con la dirección de la avería: en este dispositivo, en el
 * historial, o en la nube. Todas acaban en lo mismo, porque es lo que el dueño necesita
 * saber antes que nada: nada de lo guardado se ha ido.
 */
const FAILURE_DETAIL: Readonly<Record<SyncFailReason, string>> = {
  queue: 'No se pudo preparar la cola en este dispositivo. Lo que has guardado sigue aquí.',
  migration:
    'No se pudo preparar el historial en este dispositivo. Lo que has guardado sigue aquí.',
  remote: 'La nube rechazó parte de la sincronización. Lo que has guardado sigue aquí.',
  network: 'No se pudo hablar con la nube. Lo que has guardado sigue aquí.',
};

/** Cuando falló y no se sabe dónde: se dice eso, y nada más. */
const FAILURE_DETAIL_UNKNOWN = 'Lo que has guardado no se ha perdido: sigue en este dispositivo.';

/** La frase del error, según lo que la pasada capturó. Exportada porque es la copia. */
export function failureDetail(view: AccountSyncView): string {
  const reason = view.reason ?? null;
  return reason === null ? FAILURE_DETAIL_UNKNOWN : FAILURE_DETAIL[reason];
}

/** `1 cambio pendiente`, `3 cambios pendientes`. */
export function pendingWord(count: number): string {
  if (count <= 0) return 'Cambios pendientes';
  return count === 1 ? '1 cambio pendiente' : `${count} cambios pendientes`;
}

export function syncStateWords(view: AccountSyncView): SyncStateWords {
  switch (view.phase) {
    case 'synced':
      return { word: 'Sincronizado', detail: null, tone: 'success', retry: false };
    case 'offline':
      return {
        word: 'Sin conexión',
        detail: 'Todo se guarda en este dispositivo y subirá cuando vuelva la conexión.',
        tone: 'muted',
        retry: false,
      };
    case 'syncing':
      return { word: 'Sincronizando…', detail: null, tone: 'accent', retry: false };
    case 'pending':
      return {
        word: pendingWord(view.pendingCount),
        detail: PENDING_DETAIL,
        tone: 'accent',
        retry: false,
      };
    case 'failed':
      return {
        word: 'Error de sincronización',
        // La frase dice por dónde se rompió, en lugar de la misma vaga para todo. Un
        // fallo local y una nube que no contesta no se arreglan igual.
        detail: failureDetail(view),
        tone: 'muted',
        retry: true,
      };
  }
}

/** "Sincronizar ahora" only makes sense when there is something to talk to. */
export function canSyncNow(view: AccountSyncView): boolean {
  return view.onSync !== undefined && view.phase !== 'syncing';
}

export function canRetry(view: AccountSyncView): boolean {
  const words = syncStateWords(view);
  return words.retry && view.onRetry !== undefined;
}

/**
 * Una parte de la lista de la migración, o `null` cuando esa tabla no tenía nada. El
 * género viaja con ella porque el participio tiene que concordar con la última palabra.
 */
interface Counted {
  readonly text: string;
  readonly gender: 'f' | 'm';
}

function counted(count: number, one: string, many: string, gender: 'f' | 'm'): Counted | null {
  if (count <= 0) return null;
  return { text: `${count} ${count === 1 ? one : many}`, gender };
}

/** El participio concuerda con la última palabra de la lista, que es la que manda. */
function migrationVerb(gender: 'f' | 'm', delivered: boolean): string {
  if (delivered) return gender === 'f' ? 'subidas' : 'subidos';
  return gender === 'f' ? 'preparadas para subir' : 'preparados para subir';
}

/**
 * «Historial: 12 sesiones, 4 pesajes y 30 actividades subidas.» (S7: «Mostrar al usuario
 * si la importación ha terminado correctamente»).
 *
 * `subidas` solo cuando la cola de la migración ya está vacía; mientras quede algo se dice
 * `preparadas para subir`, que es lo que de verdad ha pasado hasta ese momento. Un fallo
 * tiene su propia frase y nunca se disfraza de éxito.
 */
export function migrationLine(view: AccountSyncView): string | null {
  const migrated = view.migrated ?? null;
  if (migrated === null) return null;

  if (migrated.failed) {
    return 'No se pudo preparar todo el historial. Lo que ya había sigue en este dispositivo y se reanudará en la próxima sincronización.';
  }

  const parts = [
    counted(migrated.sessions, 'sesión', 'sesiones', 'f'),
    counted(migrated.measurements, 'pesaje', 'pesajes', 'm'),
    counted(migrated.activities, 'actividad', 'actividades', 'f'),
  ].filter((part): part is Counted => part !== null);

  if (parts.length === 0) return null;

  const last = parts[parts.length - 1] ?? parts[0];
  if (last === undefined) return null;

  const verb = migrationVerb(last.gender, view.pendingCount === 0);

  const list =
    parts.length === 1
      ? last.text
      : `${parts.slice(0, -1).map((part) => part.text).join(', ')} y ${last.text}`;

  return `Historial: ${list} ${verb}.`;
}

const WHEN = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** `Última sincronización correcta: 9 nov, 16:04.` */
export function lastSyncLine(view: AccountSyncView): string {
  if (view.lastSyncedAt === null) return 'Última sincronización correcta: todavía ninguna.';
  return `Última sincronización correcta: ${WHEN.format(view.lastSyncedAt)}.`;
}

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
        detail: 'Lo que has guardado no se ha perdido: sigue en este dispositivo.',
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

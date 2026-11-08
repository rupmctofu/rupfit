/**
 * The session journal: the three things §7 does not store, kept for the length of one
 * app launch.
 *
 * `sessionStorage`, not IndexedDB, and deliberately so: the journal is not evidence. It
 * holds the card on screen, the rest bar and the skipped slots — session-local fields
 * the model rebuilds from the record on recovery. Storage stays the only journal of
 * confirmed sets (§7), so a lost journal costs a scroll position, never a set.
 *
 * Every read validates the shape: a half-written or foreign value is treated as "no
 * journal" instead of crashing the sheet, and `sessionStorage` itself may throw in
 * private mode, which is also "no journal".
 */

import type { SessionState } from '../../core/session/model';
import type { SessionJournal } from './controller';

export const JOURNAL_KEY = 'rupfit.session.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The smallest check that makes the value safe to hand the reducer: the identity, the
 * two session-local fields and the exercise list. A reducer that trusted more than this
 * would trust whatever a previous build wrote.
 */
export function isSessionState(value: unknown): value is SessionState {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.activeIndex !== 'number') return false;
  if (typeof value.status !== 'string') return false;
  if (!isRecord(value.rest)) return false;
  if (!Array.isArray(value.exercises)) return false;

  return value.exercises.every((exercise) => {
    if (!isRecord(exercise)) return false;
    if (typeof exercise.id !== 'string') return false;
    if (!Array.isArray(exercise.sets)) return false;
    return isRecord(exercise.prescription);
  });
}

export function createSessionStorageJournal(key: string = JOURNAL_KEY): SessionJournal {
  const store = (): Storage | null => {
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      return null;
    }
  };

  return {
    read(): SessionState | null {
      const storage = store();
      if (storage === null) return null;
      try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return isSessionState(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    write(state: SessionState): void {
      const storage = store();
      if (storage === null) return;
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        // A full or disabled store loses the scroll position, never a set.
      }
    },
    clear(): void {
      const storage = store();
      if (storage === null) return;
      try {
        storage.removeItem(key);
      } catch {
        // Nothing to do: the journal is disposable by design.
      }
    },
  };
}

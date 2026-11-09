/**
 * The journal: a value survives a kill, and a broken value never reaches the reducer.
 *
 * The screen must never crash because a previous build wrote a different shape into
 * `sessionStorage`, and it must never treat a corrupt journal as "there was none of
 * today's session" either — both are "no journal", and storage is the source of truth.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { snapshotFromSource } from '../../core/session/model';
import { sessionSourceFrom } from './controller';
import { currentSession, DEMO_NOW } from './fixture';
import { createSessionStorageJournal, isSessionState, JOURNAL_KEY } from './journal';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function install(storage: MemoryStorage | null): void {
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
}

function state() {
  return snapshotFromSource(
    sessionSourceFrom(currentSession(DEMO_NOW, { confirmedSets: 1, decision: { kind: 'accepted' } })),
    // The session runs with no rest timer (S5), so neither the journal nor a resume can
    // bring a countdown back.
    false,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage');
});

describe('the session journal', () => {
  it('round-trips the state through JSON', () => {
    install(new MemoryStorage());
    const journal = createSessionStorageJournal();

    journal.write(state());

    const read = journal.read();
    expect(read?.id).toBe('session-demo');
    expect(read?.exercises[0]?.sets).toHaveLength(1);
    expect(read?.rest.startedAt).toBeNull();
  });

  it('keeps one key, so a second session cannot pile up beside the first', () => {
    const storage = new MemoryStorage();
    install(storage);
    const journal = createSessionStorageJournal();

    journal.write(state());
    journal.clear();

    expect(storage.getItem(JOURNAL_KEY)).toBeNull();
    expect(journal.read()).toBeNull();
  });

  it('treats corrupt JSON as no journal', () => {
    const storage = new MemoryStorage();
    install(storage);
    storage.setItem(JOURNAL_KEY, '{not json');

    expect(createSessionStorageJournal().read()).toBeNull();
  });

  it('treats a foreign shape as no journal', () => {
    const storage = new MemoryStorage();
    install(storage);
    storage.setItem(JOURNAL_KEY, JSON.stringify({ id: 'x', exercises: 'nope' }));

    expect(createSessionStorageJournal().read()).toBeNull();
    expect(isSessionState({ id: 'x' })).toBe(false);
  });

  it('does nothing when sessionStorage is unavailable (private mode)', () => {
    install(null);
    const journal = createSessionStorageJournal();

    expect(() => journal.write(state())).not.toThrow();
    expect(journal.read()).toBeNull();
    expect(() => journal.clear()).not.toThrow();
  });
});

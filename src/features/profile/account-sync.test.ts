/**
 * The five sync states of spec S8, in words.
 *
 * The card prints exactly these labels; the engine (written in parallel) only decides
 * which phase is true. So this is the contract a reviewer should read when the copy of
 * the account card and the copy of the sync engine drift apart.
 */

import { describe, expect, it } from 'vitest';
import {
  NO_SYNC,
  canRetry,
  canSyncNow,
  lastSyncLine,
  pendingWord,
  syncStateWords,
  type AccountSyncView,
  type SyncPhase,
} from './account-sync';

const view = (phase: SyncPhase, patch: Partial<AccountSyncView> = {}): AccountSyncView => ({
  ...NO_SYNC,
  phase,
  ...patch,
});

describe('syncStateWords', () => {
  it('names the five states with the words of S8', () => {
    expect(syncStateWords(view('synced')).word).toBe('Sincronizado');
    expect(syncStateWords(view('offline')).word).toBe('Sin conexión');
    expect(syncStateWords(view('syncing')).word).toBe('Sincronizando…');
    expect(syncStateWords(view('pending', { pendingCount: 3 })).word).toBe('3 cambios pendientes');
    expect(syncStateWords(view('failed')).word).toBe('Error de sincronización');
  });

  it('carries the number of pending changes in the word itself', () => {
    expect(syncStateWords(view('pending', { pendingCount: 1 })).word).toBe('1 cambio pendiente');
    expect(syncStateWords(view('pending', { pendingCount: 0 })).word).toBe('Cambios pendientes');
  });

  it('offers Reintentar only on an error', () => {
    expect(syncStateWords(view('failed')).retry).toBe(true);
    for (const phase of ['synced', 'offline', 'syncing', 'pending'] as const) {
      expect(syncStateWords(view(phase)).retry).toBe(false);
    }
  });

  it('never says a sync succeeded while it is still running', () => {
    expect(syncStateWords(view('syncing')).tone).not.toBe('success');
  });
});

describe('the default view', () => {
  it('is offline with nothing pending: this task must compile and be honest alone', () => {
    expect(NO_SYNC.phase).toBe('offline');
    expect(NO_SYNC.pendingCount).toBe(0);
    expect(NO_SYNC.lastSyncedAt).toBeNull();
    expect(syncStateWords(NO_SYNC).word).toBe('Sin conexión');
  });

  it('offers no action without an engine behind it', () => {
    expect(canSyncNow(NO_SYNC)).toBe(false);
    expect(canRetry({ ...NO_SYNC, phase: 'failed' })).toBe(false);
  });

  it('offers both actions when the engine provides them', () => {
    const wired = { ...NO_SYNC, onSync: () => undefined, onRetry: () => undefined };

    expect(canSyncNow(wired)).toBe(true);
    expect(canSyncNow({ ...wired, phase: 'syncing' })).toBe(false);
    expect(canRetry({ ...wired, phase: 'failed' })).toBe(true);
  });
});

describe('lastSyncLine', () => {
  it('says so when there has never been a successful sync', () => {
    expect(lastSyncLine(NO_SYNC)).toBe('Última sincronización correcta: todavía ninguna.');
  });

  it('names the moment when there has been one', () => {
    const line = lastSyncLine({ ...NO_SYNC, lastSyncedAt: Date.UTC(2026, 10, 9, 16, 4) });

    expect(line).toContain('Última sincronización correcta');
    expect(line).not.toContain('todavía');
  });
});

describe('pendingWord', () => {
  it('speaks about zero and negative counts without a number', () => {
    expect(pendingWord(0)).toBe('Cambios pendientes');
    expect(pendingWord(-1)).toBe('Cambios pendientes');
  });
});

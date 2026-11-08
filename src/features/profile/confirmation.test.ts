/**
 * The typed confirmation — docs/data-model.md §9 restore, §10 deletion, I-5.
 *
 * The storage layer refuses the operation unless the exact word arrives; this module
 * is the gate the screen draws, and it is deliberately stricter than the storage
 * layer in one way that matters: it never trims, never folds case and never accepts a
 * near miss, so no accidental tap can destroy the only copy of the history.
 */

import { describe, expect, it } from 'vitest';
import { DELETE_ALL_CONFIRMATION, RESTORE_CONFIRMATION } from '../../storage';
import { confirmationGate, deleteGate, restoreGate } from './confirmation';

describe('confirmationGate', () => {
  it('is empty before anything is typed', () => {
    expect(confirmationGate('', RESTORE_CONFIRMATION)).toBe('empty');
  });

  it('is ready only on the exact word the storage layer expects', () => {
    expect(confirmationGate('REEMPLAZAR', RESTORE_CONFIRMATION)).toBe('ready');
  });

  it('rejects a case difference: the key held down is not a confirmation', () => {
    expect(confirmationGate('reemplazar', RESTORE_CONFIRMATION)).toBe('wrong');
    expect(confirmationGate('Reemplazar', RESTORE_CONFIRMATION)).toBe('wrong');
  });

  it('rejects a trailing space instead of trimming it away', () => {
    expect(confirmationGate('REEMPLAZAR ', RESTORE_CONFIRMATION)).toBe('wrong');
    expect(confirmationGate(' REEMPLAZAR', RESTORE_CONFIRMATION)).toBe('wrong');
  });

  it('rejects a prefix of the word', () => {
    expect(confirmationGate('REEMPL', RESTORE_CONFIRMATION)).toBe('wrong');
  });
});

describe('restoreGate', () => {
  it('cannot restore before a document has validated', () => {
    expect(restoreGate({ validated: false, typed: RESTORE_CONFIRMATION })).toBe('no-document');
  });

  it('needs the word after a document validated', () => {
    expect(restoreGate({ validated: true, typed: '' })).toBe('empty');
    expect(restoreGate({ validated: true, typed: 'REEMPLAZAR' })).toBe('ready');
  });
});

describe('deleteGate', () => {
  it('uses the deletion word of §10, not the restore word', () => {
    expect(deleteGate(DELETE_ALL_CONFIRMATION)).toBe('ready');
    expect(deleteGate(RESTORE_CONFIRMATION)).toBe('wrong');
  });

  it('rejects near misses the same way as restore', () => {
    expect(deleteGate('')).toBe('empty');
    expect(deleteGate('BORRAR TODO ')).toBe('wrong');
    expect(deleteGate('borrar todo')).toBe('wrong');
  });

  it('tracks the constant the storage layer checks, so the two cannot drift', () => {
    expect(DELETE_ALL_CONFIRMATION).toBe('BORRAR TODO');
    expect(RESTORE_CONFIRMATION).toBe('REEMPLAZAR');
  });
});

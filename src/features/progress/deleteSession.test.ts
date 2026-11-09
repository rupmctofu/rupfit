import { describe, expect, it } from 'vitest';
import { deleteGate, deleteHint, deletePhrase } from './deleteSession';

/**
 * The gate of odd/tasks/delete-session.md S3: nothing is removed without the sentence the
 * repository verifies. These are the cases the screen can be in, and each asserts the
 * whole answer, not just its label.
 */
describe('deleting a stored session (S3)', () => {
  const day = 'Sentadilla / Pierna';

  it('asks for the same phrase the repository checks', () => {
    // `BORRAR <day>` is `deleteSessionConfirmation`, the one the store compares against;
    // a different wording here would pass the UI and fail the write.
    expect(deletePhrase(day)).toBe('BORRAR Sentadilla / Pierna');
  });

  it('treats an empty field as nothing typed yet, not as a mismatch', () => {
    expect(deleteGate('', day)).toBe('empty');
    expect(deleteGate('   ', day)).toBe('empty');
    expect(deleteHint('empty', day)).toBe(
      'Escribe BORRAR Sentadilla / Pierna para borrar la sesión.',
    );
  });

  it('unlocks only on the exact sentence', () => {
    expect(deleteGate('BORRAR Sentadilla / Pierna', day)).toBe('ready');
    expect(deleteHint('ready', day)).toBe('Coincide: puedes borrar la sesión.');
  });

  it('refuses every near miss and says what to type', () => {
    for (const typed of [
      'BORRAR',
      'borrar Sentadilla / Pierna',
      'BORRAR sentadilla / pierna',
      'BORRAR  Sentadilla / Pierna',
      'ELIMINAR Sentadilla / Pierna',
    ]) {
      expect(deleteGate(typed, day)).toBe('wrong');
    }
    expect(deleteHint('wrong', day)).toBe(
      'No coincide. Escribe BORRAR Sentadilla / Pierna.',
    );
  });

  it('names the day it is deleting, so two sessions cannot share a phrase by accident', () => {
    expect(deletePhrase('Press banca / Empuje')).not.toBe(deletePhrase(day));
    expect(deleteGate('BORRAR Sentadilla / Pierna', 'Press banca / Empuje')).toBe('wrong');
  });

  it('ignores surrounding whitespace but not inner characters', () => {
    expect(deleteGate('  BORRAR Sentadilla / Pierna  ', day)).toBe('ready');
    expect(deleteGate('BORRAR Sentadilla/Pierna', day)).toBe('wrong');
  });
});

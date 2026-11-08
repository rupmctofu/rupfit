/**
 * What Perfil says about the stored data — data-model §11, design-system §2.5, Q-4.
 *
 * Two honest limits decide this module. The browser may refuse to say how much space
 * the app uses, and WebKit cannot be asked to make storage persistent at all, so
 * "cannot be asked" is `null` and is never rendered as "no" (§1.6). And the store is
 * not the backup: the export is the only durable copy, which the screen has to say.
 */

import { describe, expect, it } from 'vitest';
import {
  SESSION_READ_LIMIT,
  formatBytes,
  isEmptySnapshot,
  persistenceLine,
  storageInventory,
  storageUsageLine,
  type DataSnapshot,
} from './storage-inventory';

const EMPTY: DataSnapshot = {
  hasProfile: false,
  sessions: 0,
  exercises: 0,
  customExercises: 0,
  planDays: 0,
  measurements: 0,
  activities: 0,
};

const POPULATED: DataSnapshot = {
  hasProfile: true,
  sessions: 84,
  exercises: 46,
  customExercises: 2,
  planDays: 3,
  measurements: 12,
  activities: 4,
};

describe('formatBytes', () => {
  it('keeps small sizes in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('uses a decimal comma, one decimal below ten units, none above', () => {
    expect(formatBytes(1000)).toBe('1,0 kB');
    expect(formatBytes(1540)).toBe('1,5 kB');
    expect(formatBytes(124_000)).toBe('124 kB');
    expect(formatBytes(1_234_567)).toBe('1,2 MB');
    expect(formatBytes(45_000_000)).toBe('45 MB');
  });
});

describe('storageUsageLine', () => {
  it('says the browser did not answer instead of inventing a size', () => {
    expect(storageUsageLine({ usageBytes: null, quotaBytes: null })).toBe(
      'El navegador no informa del espacio que ocupan los datos.',
    );
  });

  it('states the usage it was given, with the quota only when there is one', () => {
    expect(storageUsageLine({ usageBytes: 124_000, quotaBytes: null })).toBe(
      'Los datos ocupan 124 kB.',
    );
    expect(storageUsageLine({ usageBytes: 124_000, quotaBytes: 6_000_000 })).toBe(
      'Los datos ocupan 124 kB de los 6,0 MB de cuota.',
    );
  });

  it('does not turn an unknown usage into zero', () => {
    expect(storageUsageLine({ usageBytes: null, quotaBytes: 6_000_000 })).toBe(
      'El navegador no informa del espacio que ocupan los datos.',
    );
  });
});

describe('persistenceLine', () => {
  it('distinguishes "cannot be asked" from "refused" (Q-4, WebKit has no API)', () => {
    const cannotBeAsked =
      'No se puede pedir almacenamiento persistente: este navegador no lo implementa.';
    expect(persistenceLine(null)).toBe(cannotBeAsked);
    expect(persistenceLine({ persisted: null, checkedAt: 0 })).toBe(cannotBeAsked);
    expect(persistenceLine({ persisted: false, checkedAt: 0 })).toBe(
      'El navegador no ha concedido el almacenamiento persistente.',
    );
    expect(persistenceLine({ persisted: true, checkedAt: 0 })).toBe(
      'Almacenamiento persistente concedido.',
    );
  });
});

describe('storageInventory', () => {
  it('lists what is stored with the counts it was given', () => {
    const rows = storageInventory(POPULATED);
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));

    expect(byLabel.get('Perfil y objetivos')).toBe('Guardado');
    expect(byLabel.get('Rutina semanal')).toBe('3 días');
    expect(byLabel.get('Ejercicios')).toBe('46 · 2 propios');
    expect(byLabel.get('Sesiones y series')).toBe('84');
    expect(byLabel.get('Pesos corporales')).toBe('12');
    expect(byLabel.get('Actividades')).toBe('4');
  });

  it('states the empty case as empty, never as zero sessions of a real history', () => {
    const byLabel = new Map(storageInventory(EMPTY).map((row) => [row.label, row.value]));

    expect(byLabel.get('Perfil y objetivos')).toBe('Sin crear');
    expect(byLabel.get('Rutina semanal')).toBe('Sin días');
    expect(byLabel.get('Sesiones y series')).toBe('Ninguna');
    expect(byLabel.get('Pesos corporales')).toBe('Ninguno');
    expect(byLabel.get('Actividades')).toBe('Ninguna');
  });

  it('never claims an exact session count past the read limit', () => {
    const byLabel = new Map(
      storageInventory({ ...POPULATED, sessions: SESSION_READ_LIMIT }).map((row) => [
        row.label,
        row.value,
      ]),
    );

    expect(byLabel.get('Sesiones y series')).toBe(`${SESSION_READ_LIMIT} o más`);
  });
});

describe('isEmptySnapshot', () => {
  it('is true only when nothing at all was ever stored', () => {
    expect(isEmptySnapshot(EMPTY)).toBe(true);
    expect(isEmptySnapshot({ ...EMPTY, sessions: 1 })).toBe(false);
    expect(isEmptySnapshot({ ...EMPTY, hasProfile: true })).toBe(false);
    expect(isEmptySnapshot({ ...EMPTY, planDays: 3 })).toBe(false);
    expect(isEmptySnapshot({ ...EMPTY, measurements: 1 })).toBe(false);
    expect(isEmptySnapshot({ ...EMPTY, activities: 1 })).toBe(false);
  });

  it('ignores the exercise library: a reseed after a reset is not data (§10)', () => {
    expect(isEmptySnapshot({ ...EMPTY, exercises: 46 })).toBe(true);
  });
});

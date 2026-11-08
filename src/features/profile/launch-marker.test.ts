/**
 * The launch marker, and the eviction state it makes possible — design-system §2.5
 * and §7.8.
 *
 * Eviction and a first run look identical from inside IndexedDB: both are empty. The
 * only way to tell them apart is a note that lives outside the database, which is
 * also the only place the date of the last successful export can live — writing it
 * into the store would mean losing it exactly when the screen needs it.
 */

import { describe, expect, it } from 'vitest';
import {
  dataState,
  evictionCopy,
  registerLaunch,
  rememberData,
  rememberExport,
  type LaunchMarker,
  type MarkerStore,
} from './launch-marker';
import type { DataSnapshot } from './storage-inventory';

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

function memoryStore(initial: LaunchMarker | null = null): MarkerStore & {
  readonly marker: () => LaunchMarker | null;
} {
  let marker = initial;
  return {
    marker: () => marker,
    read: () => marker,
    write: (next) => {
      marker = next;
    },
  };
}

const EXPORTED_AT = Date.UTC(2026, 10, 8, 10, 0, 0);

describe('registerLaunch', () => {
  it('records the first launch and keeps the first instant on later ones', () => {
    const store = memoryStore();

    const first = registerLaunch(store, 1000);
    expect(first).toEqual({
      firstLaunchAt: 1000,
      lastLaunchAt: 1000,
      hadData: false,
      lastExportAt: null,
    });

    const second = registerLaunch(store, 2000);
    expect(second.firstLaunchAt).toBe(1000);
    expect(second.lastLaunchAt).toBe(2000);
  });

  it('never invents a last export', () => {
    const store = memoryStore();
    expect(registerLaunch(store, 1000).lastExportAt).toBeNull();
  });

  it('keeps "data was here" and the export date across launches', () => {
    const store = memoryStore();
    registerLaunch(store, 1000);
    rememberData(store, 1000);
    rememberExport(store, EXPORTED_AT);

    const later = registerLaunch(store, 5000);

    expect(later.hadData).toBe(true);
    expect(later.lastExportAt).toBe(EXPORTED_AT);
    expect(later.lastLaunchAt).toBe(5000);
    // Which is the whole point: the next empty read is an eviction, not a first run.
    expect(dataState(later, EMPTY)).toBe('evicted');
  });
});

describe('rememberData', () => {
  it('marks the store as used, which is what makes eviction detectable', () => {
    const store = memoryStore(registerLaunch(memoryStore(), 1000));

    const marker = rememberData(store, 2000);

    expect(marker?.hadData).toBe(true);
    expect(store.marker()?.hadData).toBe(true);
  });

  it('does nothing when the app was never registered', () => {
    const store = memoryStore();
    expect(rememberData(store, 2000)).toBeNull();
  });
});

describe('rememberExport', () => {
  it('records the instant of a confirmed export and keeps everything else', () => {
    const store = memoryStore(registerLaunch(memoryStore(), 1000));

    const marker = rememberExport(store, EXPORTED_AT);

    expect(marker?.lastExportAt).toBe(EXPORTED_AT);
    expect(marker?.firstLaunchAt).toBe(1000);
  });
});

describe('dataState', () => {
  const fresh: LaunchMarker = {
    firstLaunchAt: 1000,
    lastLaunchAt: 1000,
    hadData: false,
    lastExportAt: null,
  };
  const used: LaunchMarker = { ...fresh, hadData: true };

  it('is a first run when the app has never seen data', () => {
    expect(dataState(fresh, EMPTY)).toBe('first-run');
  });

  it('is populated when anything is stored', () => {
    expect(dataState(fresh, POPULATED)).toBe('populated');
  });

  it('is evicted when data was seen before and the store came back empty', () => {
    expect(dataState(used, EMPTY)).toBe('evicted');
  });

  it('is populated again after an import, without a marker to reset', () => {
    expect(dataState(used, POPULATED)).toBe('populated');
  });
});

describe('evictionCopy', () => {
  const used: LaunchMarker = {
    firstLaunchAt: 1000,
    lastLaunchAt: 2000,
    hadData: true,
    lastExportAt: null,
  };

  it('uses the sentence of §7.8 and says nothing about a copy it does not know', () => {
    const copy = evictionCopy(used);

    expect(copy).toContain('Los datos guardados ya no están.');
    expect(copy).toContain('Importa tu copia si la tienes.');
    expect(copy).not.toContain('Última copia');
  });

  it('names the date of the last successful export when it is known', () => {
    const copy = evictionCopy({ ...used, lastExportAt: EXPORTED_AT });

    expect(copy).toContain('Última copia:');
    expect(copy).toMatch(/8\s?nov(\.)?\s?2026/i);
  });
});

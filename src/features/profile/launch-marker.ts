/**
 * The launch marker, and the eviction state it makes possible — design-system §2.5 and
 * §7.8.
 *
 * From inside IndexedDB, an evicted container and a first run are indistinguishable:
 * both are empty. The app must not answer a real loss with a blank, cheerful first run
 * (§2.5), so the fact that something *was* stored has to live outside the database, and
 * so does the date of the last successful export — writing either into the store would
 * lose it exactly when the screen needs it.
 *
 * That is all the marker is: two instants and one flag. It is not a domain row, it is
 * never exported (§9 exports "nothing beyond the domain"), and losing it costs the
 * eviction *detection*, never any data. The store is a browser edge (localStorage); the
 * logic here is pure, so a test can pin the clock and prove the three states.
 */

import type { EpochMs, StorageAnswer } from '../../storage';
import { isEmptySnapshot, type DataSnapshot } from './storage-inventory';

export interface LaunchMarker {
  readonly firstLaunchAt: EpochMs;
  readonly lastLaunchAt: EpochMs;
  /** True once anything was ever seen in the store: the difference between the two. */
  readonly hadData: boolean;
  /** §7.8: the evicted state names the last successful export when it is known. */
  readonly lastExportAt: EpochMs | null;
}

/** The browser edge. `createMarkerStore()` in `browser-edges.ts` is the localStorage one. */
export interface MarkerStore {
  read(): LaunchMarker | null;
  write(marker: LaunchMarker): void;
}

export type DataState = 'first-run' | 'populated' | 'evicted';

/** Records this launch. The first instant is kept: it is the only "since" the app has. */
export function registerLaunch(store: MarkerStore, now: EpochMs): LaunchMarker {
  const previous = store.read();
  const marker: LaunchMarker = {
    firstLaunchAt: previous === null ? now : previous.firstLaunchAt,
    lastLaunchAt: now,
    hadData: previous?.hadData ?? false,
    lastExportAt: previous?.lastExportAt ?? null,
  };
  store.write(marker);
  return marker;
}

/** Called when a read pass found something. Idempotent; `null` before `registerLaunch`. */
export function rememberData(store: MarkerStore, now: EpochMs): LaunchMarker | null {
  const previous = store.read();
  if (previous === null || previous.hadData) return previous;
  const marker: LaunchMarker = { ...previous, lastLaunchAt: now, hadData: true };
  store.write(marker);
  return marker;
}

/**
 * Records a *confirmed* export only. An unobservable one does not get a date: the
 * eviction copy would then promise a copy that may not exist.
 */
export function rememberExport(store: MarkerStore, now: EpochMs): LaunchMarker | null {
  const previous = store.read();
  if (previous === null) return null;
  const marker: LaunchMarker = { ...previous, lastLaunchAt: now, lastExportAt: now };
  store.write(marker);
  return marker;
}

/**
 * `first-run` — nothing was ever stored. `populated` — something is. `evicted` — data
 * was stored before and the store came back empty. This is the only reading of the
 * marker the screen makes.
 */
export function dataState(marker: LaunchMarker, snapshot: DataSnapshot): DataState {
  if (!isEmptySnapshot(snapshot)) return 'populated';
  return marker.hadData ? 'evicted' : 'first-run';
}

/**
 * §7.8, verbatim, plus the last export when one is known. The evicted state is the only
 * non-dismissible platform state: the condition it reports is a real loss.
 */
export function evictionCopy(marker: LaunchMarker): string {
  const base = 'Los datos guardados ya no están. Importa tu copia si la tienes.';
  return marker.lastExportAt === null
    ? base
    : `${base} Última copia: ${formatDay(marker.lastExportAt)}.`;
}

/** `8 nov 2026` — the same shape the rest of the app uses for a date, in Spanish. */
export function formatDay(at: EpochMs): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at));
}

/**
 * `Sí.` / `No.` / `El navegador no permite pedirlo.` — the storage box next to the
 * marker. Re-exported from here because both describe what protects the data.
 */
export type { StorageAnswer };

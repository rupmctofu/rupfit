/**
 * The one place Perfil reads: storage, the browser's storage estimate, the installed
 * probe and the update watch.
 *
 * The screen below receives plain values and never touches `StoragePort`, `navigator`
 * or the clock. Two details matter more than they look:
 *
 * - The marker is registered before the snapshot is judged, and `rememberData` runs
 *   only after a read found something, so "evicted" can never be the first launch's
 *   answer (design-system §2.5).
 * - The persistence probe of Q-4 runs **once per launch**, at most, and is recorded; a
 *   second visit to Perfil reads the recorded answer instead of asking again.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { StorageAnswer, StoragePort, UserProfile } from '../../storage';
import { probeStoragePersistence } from '../../storage/browser/persistence';
import { useAppServices } from '../../app/providers';
import {
  createMarkerStore,
  readInstalledProbe,
  readStorageEstimate,
} from './browser-edges';
import type { InstalledProbe } from './device-mode';
import {
  registerLaunch,
  rememberData,
  type LaunchMarker,
  type MarkerStore,
} from './launch-marker';
import {
  createServiceWorkerWatch,
  serviceWorkerUrl,
  type UpdateRuntime,
} from './service-worker';
import {
  SESSION_READ_LIMIT,
  isEmptySnapshot,
  type DataSnapshot,
  type UsageEstimate,
} from './storage-inventory';

export type ProfilePhase = 'loading' | 'ready' | 'failed';

export interface ProfileData {
  readonly phase: ProfilePhase;
  readonly snapshot: DataSnapshot;
  readonly profile: UserProfile | null;
  readonly storageAnswer: StorageAnswer | null;
  readonly sessionRunning: boolean;
  readonly marker: LaunchMarker | null;
  readonly usage: UsageEstimate;
  readonly installed: InstalledProbe;
  /** Why the read failed, in Spanish. The screen draws it as an `ErrorBanner`. */
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: DataSnapshot = {
  hasProfile: false,
  sessions: 0,
  exercises: 0,
  customExercises: 0,
  planDays: 0,
  measurements: 0,
  activities: 0,
};

const NOTHING: UsageEstimate = { usageBytes: null, quotaBytes: null };

/** Q-4: at most one probe per launch, shared by every mount of the screen. */
let probedThisLaunch = false;

export interface ProfileStore {
  readonly data: ProfileData;
  readonly markerStore: MarkerStore;
  reload(): Promise<void>;
}

export function useProfileData(): ProfileStore {
  const { storage, clock } = useAppServices();
  const [markerStore] = useState<MarkerStore>(() => createMarkerStore());
  const [installed] = useState<InstalledProbe>(() => readInstalledProbe());
  const [data, setData] = useState<ProfileData>({
    phase: 'loading',
    snapshot: EMPTY_SNAPSHOT,
    profile: null,
    storageAnswer: null,
    sessionRunning: false,
    marker: null,
    usage: NOTHING,
    installed,
    error: null,
  });

  const read = useCallback(async (): Promise<void> => {
    const now = clock.now();
    try {
      await storage.open();

      const [profile, exercises, planDays, measurements, activities, recent, inProgress] =
        await Promise.all([
          storage.profile.read(),
          storage.exercises.all(),
          storage.plan.all(),
          storage.measurements.all(),
          storage.activities.all(),
          storage.sessions.recent(SESSION_READ_LIMIT),
          storage.sessions.inProgress(),
        ]);

      const snapshot: DataSnapshot = {
        hasProfile: profile !== undefined,
        sessions: recent.length,
        exercises: exercises.length,
        customExercises: exercises.filter((exercise) => exercise.isCustom).length,
        planDays: planDays.length,
        measurements: measurements.length,
        activities: activities.length,
      };

      // Always register (it keeps the first launch), then record that the store was
      // used: without both, a container evicted tomorrow would read as a first run.
      registerLaunch(markerStore, now);
      const marker = isEmptySnapshot(snapshot)
        ? markerStore.read()
        : (rememberData(markerStore, now) ?? markerStore.read());

      const storageAnswer = await readAnswer(storage, now);
      const usage = await readStorageEstimate();

      setData({
        phase: 'ready',
        snapshot,
        profile: profile ?? null,
        storageAnswer,
        sessionRunning: inProgress !== undefined,
        marker,
        usage,
        installed,
        error: null,
      });
    } catch (error) {
      setData((previous) => ({
        ...previous,
        phase: 'failed',
        error:
          error instanceof Error
            ? `No se pudieron leer tus datos: ${error.message}`
            : 'No se pudieron leer tus datos.',
      }));
    }
  }, [clock, installed, markerStore, storage]);

  const reload = useCallback(async (): Promise<void> => {
    await read();
  }, [read]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // The database can be blocked or closed under the screen (§5.3): that is re-read rather
  // than guessed. `open` is deliberately not a trigger — it is this hook's own boot, and
  // reacting to it would read everything twice on every mount.
  useEffect(
    () =>
      storage.subscribe((state) => {
        if (state.status === 'blocked' || state.status === 'terminated' || state.status === 'failed') {
          void reload();
        }
      }),
    [reload, storage],
  );

  return { data, markerStore, reload };
}

async function readAnswer(storage: StoragePort, now: number): Promise<StorageAnswer | null> {
  const stored = await storage.meta.readStorageAnswer();
  if (probedThisLaunch) return stored ?? null;
  probedThisLaunch = true;
  try {
    return await probeStoragePersistence(storage, now);
  } catch {
    return stored ?? null;
  }
}

export interface UpdateAccess {
  readonly runtime: UpdateRuntime;
  readonly applying: boolean;
  applyUpdate(): void;
}

/**
 * The waiting worker, and the one tap that hands over to it. Registration happens once
 * per launch and only in a production build: `vite dev` has no `sw.js` to register.
 */
export function useUpdateWatch(): UpdateAccess {
  const [watch] = useState(() =>
    createServiceWorkerWatch({
      container: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null,
      scriptUrl: serviceWorkerUrl(import.meta.env.BASE_URL),
      reload: () => window.location.reload(),
    }),
  );
  const runtime = useSyncExternalStore(watch.subscribe, watch.runtime, watch.runtime);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (import.meta.env.PROD) watch.register();
  }, [watch]);

  const applyUpdate = useCallback(() => {
    setApplying(true);
    watch.applyUpdate();
  }, [watch]);

  return { runtime, applying, applyUpdate };
}

/**
 * One sync service per session, and the five states the account card renders —
 * odd/tasks/cloud-sync.md T5/T6, specs S1, S2, S4, S5, S6, S8.
 *
 * Three things this file is careful about, because each one is a way a screen could end
 * up waiting on the network:
 *
 * 1. **Nothing is built at import time.** No client, no remote, no service, no
 *    IndexedDB. `loadCloud()` runs inside the effect, and it asks `cloudConfig()` first:
 *    on a build with no Supabase project it answers "no engine" without ever loading
 *    `@supabase/supabase-js`, so the shell pays nothing for a feature it does not have.
 * 2. **Every failure is a value.** The runner catches a thrown pass, a failed pass and an
 *    unreadable queue and turns each into the `error` state of S8. `syncNow` returns
 *    `void` and never rejects; nothing here can make a local write wait.
 * 3. **The state machine is not React.** `createSyncRunner` owns the phases and the
 *    triggers and is driven with an injected clock, timers and engine, which is what lets
 *    a test in `node` walk the five states; `useSync` is the thin shell that subscribes
 *    to it, wires the platform events and re-renders.
 *
 * The triggers, and what each one does:
 *
 * - **signed in** — the history migration once per account (see below), then a pass
 *   immediately. Signed out (or no account configured) the runner is inert: it queues
 *   nothing and reads nothing (S6: another account's data must not be reachable, and this
 *   device's queue must not be touched).
 * - **`online`** — a pass. `offline` only changes the state word to `sin conexión`.
 * - **after a local write** — one pass, debounced by two seconds, so a burst of confirmed
 *   sets costs one push instead of one per set.
 * - **`Sincronizar ahora`** — a pass now, cancelling a pending debounce.
 *
 * The history migration (odd/tasks/cloud-sync.md L7, spec S7) runs **before the first
 * pass of an account**, and once per account per session: the rows written before that
 * account existed are stamped and queued there, so the pass right after them has
 * something to push. Its report travels to the card with the pass it belongs to, which is
 * what lets the card say «N sesiones, M pesajes y K actividades subidas» instead of
 * claiming a success nobody measured.
 *
 * Two rules make sure the card can always leave `sincronizando…`, because that state also
 * disables «Sincronizar ahora» and a spinner would therefore be a dead end:
 *
 * - **A pass always publishes a terminal phase.** Even `busy` — another pass holds the
 *   service — settles on what the queue says, never on the phase it started with when
 *   that phase was `syncing`.
 * - **A pass has a budget.** A request that neither resolves nor rejects is a real
 *   network, so the runner declares `error` after `PASS_BUDGET_MS` and publishes the real
 *   result if it ever arrives. Waiting forever is the one outcome the card cannot show.
 *
 * And the failure itself carries where it happened (`SyncFailReason`): four words, each
 * one taken from a value that was actually caught — the migration that threw, the pass
 * that threw, the queue that could not be read, the stages the service recorded, the
 * budget that expired. `null` means «we know it failed, not where», and then the card
 * keeps the generic sentence instead of inventing a culprit. Without it a device that
 * breaks locally and a device that cannot reach the project say exactly the same thing.
 *
 * Never two passes at once: `SyncService` is single-flight (`busy`), and the runner keeps
 * its own guard as well, remembering a trigger that arrived mid-pass so one write is not
 * dropped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EpochMs, SyncStoragePort } from '../storage';
// Type-only: the five words belong to the card (`src/features/profile/account-sync.ts`),
// and one union with two spellings is how the copy and the engine drift apart.
import type { SyncFailReason, SyncPhase } from '../features/profile/account-sync';
import type { AuthState } from './auth';
import { applyToStorage, localStoreOf } from './apply';
import { cloudConfig } from './config';
import { browserMarkers, migrateHistory, type MigrationReport } from './migrate';
import type { IdbDatabase } from './outbox';
import type { SyncService } from './sync';
import {
  conflictKey,
  type SyncConflict,
  type SyncFailure,
  type SyncStateStorePort,
  type SyncStorePort,
  type SyncTable,
} from './types';

/** How long a local write waits before it wakes the pass. Two seconds, per the task. */
export const LOCAL_WRITE_DEBOUNCE_MS = 2000;

/**
 * How long one pass may stay silent before the runner stops waiting for it. Generous on
 * purpose — a first push of a phone's whole history is many requests — and still bounded:
 * nothing else in the card can end a spinner, because `sincronizando…` is exactly the
 * state in which «Sincronizar ahora» is disabled.
 */
export const PASS_BUDGET_MS = 30_000;

/* ------------------------------------------------------------------- the engine */

/** What one pass is reduced to: whether it worked, how much of it did not, and where. */
export interface SyncPassSummary {
  readonly status: 'completed' | 'busy' | 'failed';
  readonly failures: number;
  /**
   * Las etapas que el servicio registró como fallidas, tal cual (S5). No se deduce nada
   * de ellas: es lo único que permite decir «la nube rechazó» en vez de «la cola falló»
   * sin adivinar. Ausente cuando quien llama no las cuenta.
   */
  readonly stages?: readonly SyncFailure['stage'][];
}

/**
 * The slice of `SyncService` the runner uses. Narrow on purpose: a test hands it a fake
 * with three answers, and the real one is built by `engineOf` below.
 */
export interface SyncEnginePort {
  pass(): Promise<SyncPassSummary>;
  /** S8 «Número de cambios pendientes». Throws only if the queue cannot be read. */
  pendingCount(): Promise<number>;
  /** Losers the merge kept (S5). A count is all the card shows for now. */
  conflictCount(): Promise<number>;
}

/** The real engine: a service pass, reduced to what the state machine needs. */
export function engineOf(service: SyncService): SyncEnginePort {
  return {
    async pass() {
      const result = await service.pass();
      return {
        status: result.status,
        failures: result.failures.length,
        stages: result.failures.map((failure) => failure.stage),
      };
    },
    async pendingCount() {
      const result = await service.pendingCount();
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
    async conflictCount() {
      const result = await service.listConflicts();
      return result.ok ? result.value.length : 0;
    },
  };
}

/* --------------------------------------------------------------------- the view */

/** The history migration of one account, reduced to the figures the card prints (S7). */
export interface MigratedHistory {
  readonly sessions: number;
  readonly measurements: number;
  readonly activities: number;
  /** `true` when the migration stopped on an error: what it did is kept, and it resumes. */
  readonly failed: boolean;
}

/** What the account card needs: S8's five states, the count, the moment, the losers. */
export interface SyncViewState {
  readonly phase: SyncPhase;
  /** Local changes waiting in the queue. */
  readonly pending: number;
  /** The last successful pass, or `null` when there has never been one this session. */
  readonly lastSyncedAt: EpochMs | null;
  readonly conflicts: number;
  /** The migration's report for this account, or `null` when there was nothing to move. */
  readonly migrated: MigratedHistory | null;
  /**
   * Por dónde se rompió, cuando la fase es `failed`. `null` significa «se rompió y no
   * sabemos dónde», que es una respuesta honesta; inventarse un culpable no lo es.
   */
  readonly reason: SyncFailReason | null;
}

/** `sin conexión` with nothing pending: an app with no account, and no engine yet. */
export const INERT_SYNC: SyncViewState = {
  phase: 'offline',
  pending: 0,
  lastSyncedAt: null,
  conflicts: 0,
  migrated: null,
  reason: null,
};

export interface SyncView extends SyncViewState {
  /** `Sincronizar ahora`. Never throws and never rejects. */
  readonly syncNow: () => void;
}

/* ------------------------------------------------------------------ the triggers */

/** The timers the debounce uses. Injected so a test decides when two seconds pass. */
export interface SyncTimers {
  schedule(callback: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

const DEFAULT_TIMERS: SyncTimers = {
  schedule: (callback, ms) => globalThis.setTimeout(callback, ms),
  cancel: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

export interface SyncRunnerOptions {
  /** `null` when this build has no project: every trigger is then a no-op. */
  readonly engine: SyncEnginePort | null;
  /**
   * The history migration (L7). Called once per account, before that account's first
   * pass. Absent means "nothing to migrate" — a demo, or a build with no store.
   */
  readonly migrate?: ((account: string) => Promise<MigrationReport>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly debounceMs?: number | undefined;
  readonly passBudgetMs?: number | undefined;
  readonly timers?: SyncTimers | undefined;
}

export interface SyncRunner {
  state(): SyncViewState;
  subscribe(listener: (state: SyncViewState) => void): () => void;
  /** `account` is the address the card shows: `AuthState` carries no uuid. */
  setSignedIn(signedIn: boolean, account?: string | null): void;
  setOnline(online: boolean): void;
  noteLocalWrite(): void;
  syncNow(): void;
  stop(): void;
}

export function createSyncRunner(options: SyncRunnerOptions): SyncRunner {
  const engine = options.engine;
  const migrate = options.migrate;
  const now = options.now ?? (() => Date.now());
  const debounceMs = options.debounceMs ?? LOCAL_WRITE_DEBOUNCE_MS;
  const passBudgetMs = options.passBudgetMs ?? PASS_BUDGET_MS;
  const timers = options.timers ?? DEFAULT_TIMERS;
  const listeners = new Set<(state: SyncViewState) => void>();

  let current: SyncViewState = INERT_SYNC;
  let signedIn = false;
  let account: string | null = null;
  /** Accounts whose history was already stamped in this session: never twice. */
  const migratedAccounts = new Set<string>();
  let running = false;
  let rerun = false;
  let stopped = false;
  let timer: { readonly handle: unknown } | null = null;
  let watchdog: { readonly handle: unknown } | null = null;

  function publish(next: SyncViewState): void {
    current = next;
    for (const listener of listeners) listener(current);
  }

  function patch(next: Partial<SyncViewState>): void {
    publish({ ...current, ...next });
  }

  function cancel(): void {
    if (timer === null) return;
    timers.cancel(timer.handle);
    timer = null;
  }

  /** Stops waiting for a pass: the watchdog is only ever a "we stopped waiting" mark. */
  function disarm(): void {
    if (watchdog === null) return;
    timers.cancel(watchdog.handle);
    watchdog = null;
  }

  /** The queue's length, or `null` when it could not be read (which is a failure). */
  async function readPending(): Promise<number | null> {
    if (engine === null) return 0;
    try {
      return await engine.pendingCount();
    } catch {
      return null;
    }
  }

  async function readConflicts(): Promise<number> {
    if (engine === null) return 0;
    try {
      return await engine.conflictCount();
    } catch {
      // A conflict record is a diagnostic, not a sync result: keep the last number.
      return current.conflicts;
    }
  }

  /**
   * The pass, and the only writer of the phase once one has run.
   *
   * Every branch lands on a phase the card can draw. `busy` is not a result — another
   * pass holds the service — so it is answered with the queue's own length and never
   * with `sincronizando`, which is the state this function exists to leave.
   */
  function nextState(
    before: SyncViewState,
    summary: SyncPassSummary,
    pending: number | null,
    conflicts: number,
    migrated: MigratedHistory | null,
    reason: SyncFailReason | null,
  ): SyncViewState {
    const settled = (phase: SyncPhase, lastSyncedAt: EpochMs | null): SyncViewState => ({
      phase,
      pending: pending ?? before.pending,
      lastSyncedAt,
      conflicts,
      migrated,
      // El motivo vive en el error y solo en el error: en `sincronizado` sería una
      // acusación vieja, y en `sin conexión` no hay nada que explicar.
      reason: phase === 'failed' ? reason : null,
    });

    if (summary.status === 'failed' || summary.failures > 0 || pending === null) {
      return settled('failed', before.lastSyncedAt);
    }
    if (summary.status === 'busy') {
      if (pending > 0) return settled('pending', before.lastSyncedAt);
      // Nothing pending and no result of our own: the honest word is not «sincronizado»,
      // which nobody observed, but it is also not a spinner.
      return settled(before.phase === 'syncing' ? 'offline' : before.phase, before.lastSyncedAt);
    }
    if (pending > 0) return settled('pending', before.lastSyncedAt);
    return settled('synced', now());
  }

  /**
   * The history migration, once per account. Never throws into the caller: it is a step,
   * not a gate.
   *
   * It answers with the report *and* whether it broke, because those are two different
   * facts: `failed: true` is the migration's own value (it caught a table read), while
   * `reason` says the step could not even answer — and that is the first thing a device
   * with a broken store gets wrong, before a single row is queued.
   */
  async function runMigration(): Promise<{
    readonly migrated: MigratedHistory | null;
    readonly reason: SyncFailReason | null;
  }> {
    if (migrate === undefined || account === null) {
      return { migrated: current.migrated, reason: null };
    }
    if (migratedAccounts.has(account)) return { migrated: current.migrated, reason: null };
    migratedAccounts.add(account);
    try {
      const report = await migrate(account);
      return {
        migrated: migratedOf(report),
        reason: report.status === 'failed' ? 'migration' : null,
      };
    } catch {
      // The migration promises a report; this is the belt, and it is still a value.
      return {
        migrated: { sessions: 0, measurements: 0, activities: 0, failed: true },
        reason: 'migration',
      };
    }
  }

  /**
   * The stages the service recorded, in the card's four words.
   *
   * `push` and `pull` are the two directions of the network, so a failure there is the
   * remote; `queue`, `store`, `read` and `apply` all mean this device could not read or
   * write its own rows. Nothing else is inferred: a pass that failed without recording a
   * stage answers `null`, and the card keeps the generic sentence.
   */
  function reasonOfStages(summary: SyncPassSummary): SyncFailReason | null {
    const stages = summary.stages ?? [];
    if (stages.includes('push') || stages.includes('pull')) return 'remote';
    if (stages.length > 0) return 'queue';
    return null;
  }

  async function runPass(): Promise<void> {
    if (engine === null || !signedIn || stopped) return;
    if (running) {
      // A trigger during a pass is not lost: it costs one more pass, not a queue of them.
      rerun = true;
      return;
    }

    running = true;
    const before = current;
    patch({ phase: 'syncing' });

    // The budget: a request that neither answers nor fails would otherwise hold the card
    // on `sincronizando` forever, with nothing to press. If the pass lands later, its own
    // result is published then — a late success is still a success.
    disarm();
    watchdog = {
      handle: timers.schedule(() => {
        watchdog = null;
        if (stopped) return;
        // Nadie contestó dentro del presupuesto: lo único que se sabe es que la respuesta
        // no llegó, y eso es lo que se dice.
        publish({ ...current, phase: 'failed', reason: 'network' });
      }, passBudgetMs),
    };

    let summary: SyncPassSummary;
    let migrated = before.migrated;
    let reason: SyncFailReason | null = null;
    try {
      const outcome = await runMigration();
      migrated = outcome.migrated;
      // El primer paso que se rompe es el que se nombra: la migración va antes que la
      // pasada (L7), así que si ya falló, lo de después viene de ahí.
      reason = outcome.reason;
      summary = await engine.pass();
    } catch {
      summary = { status: 'failed', failures: 1 };
      reason ??= 'network';
    } finally {
      disarm();
    }

    const pending = await readPending();
    const conflicts = await readConflicts();
    // Una cola que no se puede leer es un fallo local con nombre propio; si el paso que
    // falló no dejó etapa (un doble de prueba, por ejemplo), se queda en `null`.
    reason ??= pending === null ? 'queue' : reasonOfStages(summary);
    if (!stopped) publish(nextState(before, summary, pending, conflicts, migrated, reason));

    running = false;
    if (rerun && !stopped) {
      rerun = false;
      void runPass();
    }
  }

  return {
    state: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setSignedIn(next, nextAccount = null) {
      if (next === signedIn && (!next || nextAccount === account)) return;
      signedIn = next;
      account = next ? nextAccount : null;
      cancel();
      rerun = false;
      if (!next) {
        // Signed out: inert, and the last account's moment is not this account's (S6).
        publish(INERT_SYNC);
        return;
      }
      publish(INERT_SYNC);
      void runPass();
    },

    setOnline(online) {
      if (!online) {
        cancel();
        publish(signedIn ? { ...current, phase: 'offline' } : INERT_SYNC);
        return;
      }
      void runPass();
    },

    noteLocalWrite() {
      if (engine === null || !signedIn || stopped) return;
      if (running) {
        rerun = true;
        return;
      }
      // One trailing pass per burst: a second write does not push the deadline out.
      if (timer !== null) return;
      timer = {
        handle: timers.schedule(() => {
          timer = null;
          void runPass();
        }, debounceMs),
      };
    },

    syncNow() {
      cancel();
      void runPass();
    },

    stop() {
      stopped = true;
      cancel();
      disarm();
      listeners.clear();
    },
  };
}

/** The migration report reduced to what the card prints. `idle` has nothing to say. */
function migratedOf(report: MigrationReport): MigratedHistory | null {
  if (report.status === 'idle') return null;
  return {
    sessions: report.counts.sessions,
    measurements: report.counts.measurements,
    activities: report.counts.activities,
    failed: report.status === 'failed',
  };
}

/* ------------------------------------------------------------------ the real thing */

/** The state half when `rupfit-cloud` cannot be opened: the marks live for this launch. */
function memoryState(): SyncStateStorePort {
  const marks = new Map<SyncTable, number>();
  const conflicts: SyncConflict[] = [];

  return {
    watermarks: async () => [...marks].map(([table, since]) => ({ table, since })),
    putWatermark: async (mark) => {
      const previous = marks.get(mark.table) ?? 0;
      if (mark.since > previous) marks.set(mark.table, mark.since);
    },
    conflicts: async () => [...conflicts],
    addConflicts: async (added) => {
      const seen = new Set(conflicts.map(conflictKey));
      for (const conflict of added) {
        const key = conflictKey(conflict);
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push(conflict);
      }
    },
  };
}

/**
 * The `SyncStorePort` the service needs, in the two halves the app actually has.
 *
 * The pending ops live in `meta`, beside the row they describe: a repository appends its
 * op inside the row's own transaction, so writing them anywhere else would break the one
 * commit that makes a local write atomic (S1). The pull marks and the conflict records
 * are sync bookkeeping with no row to keep them atomic with, so they live in the
 * `rupfit-cloud` database — and, if that database cannot be opened, in memory for this
 * launch only: a lost mark re-pulls, and re-pulling is safe because the merge never
 * overwrites (S4).
 */
export async function storeOf(storage: SyncStoragePort): Promise<SyncStorePort> {
  const queue = storage.queue();
  const state: SyncStateStorePort = (await cloudStateStore()) ?? memoryState();

  return {
    allOps: () => queue.allOps(),
    putOps: (ops) => queue.putOps(ops),
    removeOps: (ids) => queue.removeOps(ids),
    watermarks: () => state.watermarks(),
    putWatermark: (mark) => state.putWatermark(mark),
    conflicts: () => state.conflicts(),
    addConflicts: (added) => state.addConflicts(added),
  };
}

/**
 * The `rupfit-cloud` database, opened once per session, as the handle
 * `indexedDbSyncStore` speaks: the **raw** DOM one.
 *
 * This is the step that used to make the first pass fail with no request in the network
 * log. `syncStore()` in `syncDb.ts` opens the database with `idb` and hands the result to
 * `indexedDbSyncStore`, which is written against raw IndexedDB: it assigns
 * `request.onsuccess` and `transaction.oncomplete`. Over `idb`, `getAll()` is already a
 * Promise, so `onsuccess` is assigned to a value that will never fire it — the promise
 * that is waiting for it never settles. The first store read of a pass is
 * `conflicts()`, before the push and before the pull, so the pass hung there until the
 * budget expired: `Error de sincronización`, and not one request to Supabase.
 *
 * The version, the store names and the record shapes are still `syncDb.ts`'s and
 * `outbox.ts`'s; this is a second opener, not a second schema. A database created by the
 * old opener already has both stores, so an install in the wild keeps its marks.
 */
let stateStore: Promise<SyncStateStorePort | null> | null = null;

function cloudStateStore(): Promise<SyncStateStorePort | null> {
  stateStore ??= openStateStore();
  return stateStore;
}

async function openStateStore(): Promise<SyncStateStorePort | null> {
  try {
    const [db, outbox] = await Promise.all([import('./syncDb'), import('./outbox')]);
    const database = await openRawDatabase(
      db.SYNC_DB_NAME,
      db.SYNC_DB_VERSION,
      (upgrade) => {
        if (!upgrade.objectStoreNames.contains(outbox.SYNC_STORE_NAMES.outbox)) {
          upgrade.createObjectStore(outbox.SYNC_STORE_NAMES.outbox, { keyPath: 'id' });
        }
        if (!upgrade.objectStoreNames.contains(outbox.SYNC_STORE_NAMES.state)) {
          upgrade.createObjectStore(outbox.SYNC_STORE_NAMES.state, { keyPath: 'key' });
        }
      },
    );
    return database === null ? null : outbox.indexedDbSyncStore({ database });
  } catch {
    // No store, no marks: memory for this launch (`memoryState`), never a failure.
    return null;
  }
}

/** The three pieces of the raw IndexedDB DOM this file needs, and nothing else. */
interface RawOpenRequest {
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  readonly result: RawDatabase;
  readonly error: unknown;
}

interface RawDatabase {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options: { keyPath: string }): unknown;
}

interface RawFactory {
  open(name: string, version: number): RawOpenRequest;
}

/** `null` when this environment has no IndexedDB at all (a Node test, an odd webview). */
function openRawDatabase(
  name: string,
  version: number,
  upgrade: (database: RawDatabase) => void,
): Promise<IdbDatabase | null> {
  const factory = (globalThis as { readonly indexedDB?: RawFactory }).indexedDB;
  if (factory === undefined) return Promise.resolve(null);

  const request = factory.open(name, version);
  request.onupgradeneeded = () => upgrade(request.result);

  return new Promise<IdbDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as unknown as IdbDatabase);
    request.onerror = () =>
      reject(request.error instanceof Error ? request.error : new Error('no se pudo abrir la cola'));
  });
}

/** The auth surface the hook watches: who is signed in, as it changes. */
export interface SyncAuthEvents {
  subscribe(listener: (state: AuthState) => void): () => void;
}

interface Cloud {
  readonly engine: SyncEnginePort | null;
  readonly auth: SyncAuthEvents | null;
}

/**
 * The one service of this session, built on first use.
 *
 * `cloudConfig()` is checked before anything Supabase-shaped is imported: a build with
 * no project answers `{ engine: null }` and the hook stays inert. When it is configured,
 * `cloudClient()` is the app's single client (`client.ts` owns the cache), the remote is
 * `SupabaseSyncRemote`, and the store is the two halves above.
 */
async function loadCloud(storage: SyncStoragePort, now: () => number): Promise<Cloud> {
  if (cloudConfig() === null) return { engine: null, auth: null };

  const [client, remote, service, auth] = await Promise.all([
    import('./client'),
    import('./remote'),
    import('./sync'),
    import('./auth'),
  ]);

  const configured = client.cloudClient();
  if (configured === null) return { engine: null, auth: auth.cloudAuth };

  const sync = service.createSyncService({
    remote: remote.supabaseRemote(configured),
    store: await storeOf(storage),
    local: localStoreOf(storage),
    apply: applyToStorage(storage),
    now,
  });

  return { engine: engineOf(sync), auth: auth.cloudAuth };
}

/** `online`/`offline` from the platform, as one subscription. Absent outside a browser. */
function watchConnection(listener: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const up = (): void => listener(true);
  const down = (): void => listener(false);
  window.addEventListener('online', up);
  window.addEventListener('offline', down);
  if (navigator.onLine === false) listener(false);

  return () => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  };
}

/* ------------------------------------------------------------------------ the hook */

export interface UseSyncOptions {
  /** The sync surface of `AppServices.cloud`; never the app-facing `StoragePort`. */
  readonly storage: SyncStoragePort;
  /** Rings after any local write appended a queue op. Absent means "no write triggers". */
  readonly subscribeWrites?: ((listener: () => void) => () => void) | undefined;
  readonly now?: (() => number) | undefined;
  /**
   * The instant the store was first used (`LaunchMarker.firstLaunchAt`): the only instant
   * a configuration row — profile, plan, phase, exercises — has ever had, and therefore
   * the one the history migration stamps it with (L7 §1).
   *
   * Read through a ref, never a dependency: the marker arrives one render after the
   * first, and restarting the runner for it would drop the pass already in flight.
   */
  readonly historyAt?: EpochMs | null | undefined;
  /**
   * A test hands its own engine, or `null` to prove the hook is inert. Left `undefined`,
   * the hook builds the real one — inside the effect, never at import time.
   */
  readonly engine?: SyncEnginePort | null | undefined;
  readonly auth?: SyncAuthEvents | null | undefined;
  /** A test's own migration; `undefined` means the real one, unless an engine is injected. */
  readonly migrate?: ((account: string) => Promise<MigrationReport>) | undefined;
  readonly debounceMs?: number | undefined;
}

/**
 * The account's sync state, live.
 *
 * Mounted once, by Perfil. Signed out — or in a build with no project — the view stays
 * `sin conexión`, the triggers do nothing, and no queue is read or written.
 */
export function useSync(options: UseSyncOptions): SyncView {
  const { storage, subscribeWrites, now, auth, debounceMs, historyAt } = options;
  const injected = options.engine;
  const injectedMigration = options.migrate;
  const [view, setView] = useState<SyncViewState>(INERT_SYNC);
  const runnerRef = useRef<SyncRunner | null>(null);
  const historyAtRef = useRef<EpochMs | null>(historyAt ?? null);

  // The marker can arrive after the first render; the migration must see the newest one.
  historyAtRef.current = historyAt ?? historyAtRef.current;

  const [markers] = useState(browserMarkers);
  const time = useMemo(() => now ?? (() => Date.now()), [now]);

  /**
   * The migration of this build: the real one over this store, or a test's own. A demo or
   * a test that injects an engine brings its own migration (or none), because a fake
   * engine has no store to stamp.
   */
  const migrate = useMemo(() => {
    if (injectedMigration !== undefined) return injectedMigration;
    if (injected !== undefined) return undefined;
    return (account: string): Promise<MigrationReport> =>
      migrateHistory({
        storage,
        markers,
        account,
        markerAt: historyAtRef.current ?? time(),
      });
  }, [injectedMigration, injected, storage, markers, time]);

  useEffect(() => {
    let disposed = false;
    const unsubscribes: (() => void)[] = [];
    let runner: SyncRunner | null = null;

    const attach = (engine: SyncEnginePort | null, events: SyncAuthEvents | null): void => {
      if (disposed) return;
      runner = createSyncRunner({
        engine,
        ...(migrate === undefined ? {} : { migrate }),
        ...(now === undefined ? {} : { now }),
        ...(debounceMs === undefined ? {} : { debounceMs }),
      });
      runnerRef.current = runner;
      unsubscribes.push(runner.subscribe(setView));
      if (events !== null) {
        unsubscribes.push(
          events.subscribe((state) =>
            runner?.setSignedIn(state.status === 'signed-in', state.email),
          ),
        );
      }
      if (subscribeWrites !== undefined) {
        unsubscribes.push(subscribeWrites(() => runner?.noteLocalWrite()));
      }
      unsubscribes.push(watchConnection((online) => runner?.setOnline(online)));
    };

    if (injected !== undefined) {
      attach(injected, auth ?? null);
    } else {
      void (async () => {
        try {
          const cloud = await loadCloud(storage, now ?? (() => Date.now()));
          attach(cloud.engine, auth ?? cloud.auth);
        } catch {
          // A chunk that cannot load is not a state the card can fix: stay inert.
          attach(null, null);
        }
      })();
    }

    return () => {
      disposed = true;
      for (const off of unsubscribes) off();
      runner?.stop();
      runnerRef.current = null;
    };
  }, [storage, subscribeWrites, now, auth, injected, migrate, debounceMs]);

  const syncNow = useCallback(() => {
    runnerRef.current?.syncNow();
  }, []);

  return { ...view, syncNow };
}

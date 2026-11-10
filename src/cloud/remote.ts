/**
 * The production `SyncRemote`: Supabase, over the tables of `docs/cloud-sync.md`.
 *
 * Three things this file owns and nothing else:
 *
 * 1. **The column map.** The local record is `camelCase` and the SQL is `snake_case`;
 *    three names are renamed because of a reserved word (`order` → `day_order`,
 *    `item_order`, `session_order`; `index` → `set_index`; `date` → `measured_at`,
 *    `occurred_at`). The map below is the only place either vocabulary is written down,
 *    so a renamed column is one line here and no call site.
 * 2. **A push is an upsert on the app id, and it never leans on a column default.**
 *    `on conflict (id) do update`, with `user_id` from the signed-in session — never from
 *    the caller and never `NULL` — so a retried push of the same row and the same `rev`
 *    leaves one row, the insert policy's `with check (auth.uid() = user_id)` holds, and
 *    a row cannot claim another account's key. The rest of the row is sent as it is and
 *    the request asks the server to fill what the row leaves out from the defaults.
 * 3. **A failure is a value.** `pushRows` answers `{ acknowledged, error }`; it never
 *    throws into a caller that is finishing a workout (S1).
 *
 * It takes the client as a constructor argument and never imports the singleton
 * (`./client`) — a test hands it a stub, and the app hands it the one configured client.
 *
 * What the migrations do not carry — `illustration` on an exercise, `substitutedFrom` on
 * an exercise session, the device-local `storage` answer — is deliberately absent from
 * these maps: a field with no column would be sent and rejected, so it stays local.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types';
import {
  errorMessage,
  type PullOutcome,
  type PushOutcome,
  type PushRow,
  type RemoteRow,
  type SyncRemote,
  type SyncRowValues,
  type SyncTable,
} from './types';

/** Local record field → SQL column, per table. Everything not listed stays local. */
const COLUMNS: Readonly<Record<SyncTable, Readonly<Record<string, string>>>> = {
  profiles: {
    displayName: 'display_name',
    massUnit: 'mass_unit',
    weightGoal: 'weight_goal',
    weeklyTrainingDays: 'weekly_training_days',
    availableEquipment: 'available_equipment',
    autoStartRestTimer: 'auto_start_rest_timer',
  },
  plan_days: {
    name: 'name',
    order: 'day_order',
  },
  plan_items: {
    planDayId: 'plan_day_id',
    order: 'item_order',
    exerciseId: 'exercise_id',
    exerciseNameSnapshot: 'exercise_name_snapshot',
    prescription: 'prescription',
  },
  phase_state: {
    block: 'block',
    passedBlocks: 'passed_blocks',
    role: 'role',
    scheduledSessionsPerWeek: 'scheduled_sessions_per_week',
  },
  exercises: {
    name: 'name',
    primaryMuscle: 'primary_muscle',
    pattern: 'pattern',
    equipment: 'equipment',
    loadIncrementKg: 'load_increment_kg',
    isCustom: 'is_custom',
    isArchived: 'is_archived',
    secondaryMuscles: 'secondary_muscles',
    description: 'description',
    variantOf: 'variant_of',
    alternatives: 'alternatives',
  },
  sessions: {
    planDayId: 'plan_day_id',
    dayNameSnapshot: 'day_name_snapshot',
    scheduledDate: 'scheduled_date',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    phase: 'phase',
    status: 'status',
    deletionPending: 'deletion_pending',
  },
  session_exercises: {
    sessionId: 'session_id',
    sessionDate: 'session_date',
    order: 'session_order',
    exerciseId: 'exercise_id',
    exerciseNameSnapshot: 'exercise_name_snapshot',
    prescription: 'prescription',
    recommendation: 'recommendation',
    decision: 'decision',
    recommendedWeightKg: 'recommended_weight_kg',
    usedWeightKg: 'used_weight_kg',
    loadDeltaKg: 'load_delta_kg',
    status: 'status',
    completedAt: 'completed_at',
  },
  sets: {
    exerciseSessionId: 'exercise_session_id',
    sessionId: 'session_id',
    index: 'set_index',
    weightKg: 'weight_kg',
    targetReps: 'target_reps',
    actualReps: 'actual_reps',
    effort: 'effort',
    discomfort: 'discomfort',
    confirmedAt: 'confirmed_at',
  },
  body_measurements: {
    date: 'measured_at',
    weightKg: 'weight_kg',
    waistCm: 'waist_cm',
    chestCm: 'chest_cm',
    armCm: 'arm_cm',
    thighCm: 'thigh_cm',
    hipCm: 'hip_cm',
    bodyFatPercent: 'body_fat_percent',
    provenance: 'provenance',
  },
  activities: {
    date: 'occurred_at',
    kind: 'kind',
    durationSeconds: 'duration_seconds',
    activeEnergyKcal: 'active_energy_kcal',
    provenance: 'provenance',
    externalSampleId: 'external_sample_id',
  },
};

/**
 * The two values whose local shape is not the SQL shape.
 *
 * `isArchived` is stored as `0 | 1` because a boolean is not an IndexedDB key (§5.1) and
 * the column is `boolean`; `externalSampleId` is an omitted key locally and a nullable,
 * partially-unique column (I-11), so "absent" and "null" have to mean the same thing on
 * the wire.
 */
const ENCODE: Readonly<Record<string, (value: unknown) => unknown>> = {
  'exercises.isArchived': (value) => value === 1,
};

const DECODE: Readonly<Record<string, (value: unknown) => unknown>> = {
  'exercises.is_archived': (value) => (value === true ? 1 : 0),
};

/**
 * The account this remote pushes as, read from the session and never from the caller.
 *
 * The emptiness check is not cosmetic: `user_id` is what the insert policy compares
 * against `auth.uid()`, and a value that is `undefined` or `''` is listed in the
 * request's `columns` parameter while vanishing from the JSON body, which is exactly the
 * `42501` this module exists to avoid. A batch with no real account belongs as an error
 * value, not as a request with a hole in it.
 */
async function sessionUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (typeof id !== 'string' || id === '') {
    throw new Error('No signed-in account: sign in before syncing.');
  }
  return id;
}

/* ---------------------------------------------------------------- wire surface */

interface WireError {
  readonly message: string;
}

interface SelectChain extends PromiseLike<{ readonly data: unknown[] | null; readonly error: WireError | null }> {
  gt(column: string, value: string): SelectChain;
  order(column: string, options: { readonly ascending: boolean }): SelectChain;
  limit(rows: number): SelectChain;
}

/**
 * The slice of PostgREST this file uses, declared structurally.
 *
 * `supabase-js` types `from()` over the table-name union, which makes a table name that
 * arrives as a parameter unusable without a generic on every call. The cast in the
 * constructor is the single place that difference is paid for.
 */
interface WireTable {
  upsert(
    rows: readonly Record<string, unknown>[],
    options: UpsertOptions,
  ): PromiseLike<{ readonly error: WireError | null }>;
  select(columns: string): SelectChain;
}

interface UpsertOptions {
  readonly onConflict: string;
  /**
   * `false` becomes `Prefer: missing=default`. `supabase-js` adds a `columns` query
   * parameter to every array upsert — the union of the payload's keys — and PostgREST
   * then inserts exactly those columns for every row of the batch. Without this header a
   * key that one row omits arrives as `NULL` rather than as its `DEFAULT`, which is how
   * `user_id` (and every other defaulted, `not null` column) was defeated. Asking for
   * `missing=default` keeps the union list honest: absent means "the server decides".
   */
  readonly defaultToNull: boolean;
}

/** The upsert options do not vary per call, so they are stated once and pinned by a test. */
const UPSERT_OPTIONS: UpsertOptions = { onConflict: 'id', defaultToNull: false };

interface WireClient {
  from(table: string): WireTable;
}

export interface SupabaseSyncRemoteOptions {
  /**
   * How many rows one pull asks for. PostgREST caps a response (1000 by default), so a
   * device that was offline for a long time needs several passes rather than one silent
   * truncation: the watermark only moves to the highest row actually applied.
   */
  readonly pullLimit?: number;
}

export const DEFAULT_PULL_LIMIT = 500;

export class SupabaseSyncRemote implements SyncRemote {
  private readonly client: SupabaseClient<Database>;
  private readonly wire: WireClient;
  private readonly pullLimit: number;

  constructor(client: SupabaseClient<Database>, options: SupabaseSyncRemoteOptions = {}) {
    this.client = client;
    this.wire = client as unknown as WireClient;
    this.pullLimit = Math.max(1, options.pullLimit ?? DEFAULT_PULL_LIMIT);
  }

  /**
   * Upserts every row, table by table, in the order given (dependency order, so a parent
   * lands before its child). An op is acknowledged only once its table committed: a
   * failure halfway leaves the earlier tables acknowledged and the rest queued, which is
   * exactly what a retry needs.
   */
  async pushRows(rows: readonly PushRow[]): Promise<PushOutcome> {
    const acknowledged: string[] = [];
    if (rows.length === 0) return { acknowledged, error: null };

    // The owner of the batch, read once: every op of a push carries the same account, so
    // one read describes all of them, a mid-batch sign-out cannot split the rows between
    // two owners, and no row ever needs its own read of the session.
    let userId: string;
    try {
      userId = await sessionUserId(this.client);
    } catch (error) {
      return { acknowledged, error: errorMessage(error) };
    }

    for (const [table, batch] of groupByTable(rows)) {
      const payload = batch.map((row) => encodeRow(table, row, userId));
      try {
        const { error } = await this.wire.from(table).upsert(payload, UPSERT_OPTIONS);
        if (error !== null) return { acknowledged, error: `${table}: ${error.message}` };
      } catch (error) {
        return { acknowledged, error: `${table}: ${errorMessage(error)}` };
      }
      for (const row of batch) acknowledged.push(row.id);
    }

    return { acknowledged, error: null };
  }

  /**
   * Rows changed after `since`, oldest first, in the server's own clock order.
   *
   * A transport failure here is thrown rather than returned: `PullOutcome` has no `error`
   * field, and answering "no changes" would tell the sync service that a table is up to
   * date when nothing was read. `SyncService` catches it, records a `pull` failure and
   * leaves the watermark where it was, which is the honest outcome (see the report).
   */
  async pullSince(table: SyncTable, since: number): Promise<PullOutcome> {
    const { data, error } = await this.wire
      .from(table)
      .select('*')
      .gt('updated_at', new Date(since).toISOString())
      .order('updated_at', { ascending: true })
      .limit(this.pullLimit);

    if (error !== null) throw new Error(`${table}: ${error.message}`);

    const rows: RemoteRow[] = [];
    for (const raw of data ?? []) {
      const row = decodeRow(table, raw);
      if (row !== null) rows.push(row);
    }
    const last = rows[rows.length - 1];
    return last === undefined ? { rows } : { rows, cursor: last.updatedAt };
  }
}

/** `{ table: rows }` in first-seen order, which is the push order the caller chose. */
function groupByTable(rows: readonly PushRow[]): readonly [SyncTable, PushRow[]][] {
  const groups = new Map<SyncTable, PushRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.table);
    if (existing === undefined) groups.set(row.table, [row]);
    else existing.push(row);
  }
  return [...groups.entries()];
}

/**
 * One local row as one SQL row: the mapped values, the id, the client's `rev`, and the
 * owner from the session. `created_at`/`updated_at` are the server's to write (a trigger
 * stamps them), so sending them would only invite a skewed clock into the ordering.
 */
function encodeRow(table: SyncTable, row: PushRow, userId: string): Record<string, unknown> {
  const columns = COLUMNS[table];
  const payload: Record<string, unknown> = { id: row.rowId, user_id: userId, rev: row.rev };

  for (const [field, column] of Object.entries(columns)) {
    const value = row.values[field];
    if (value === undefined) continue;
    const encode = ENCODE[`${table}.${field}`];
    payload[column] = encode === undefined ? value : encode(value);
  }

  // A delete is an update that sets `deleted_at` (docs/cloud-sync.md §2); `sync.ts`
  // already put the instant in the values, and a live row sends an explicit null so a
  // resurrected row clears the mark instead of keeping a stale one.
  const deletedAt = row.values['deleted_at'];
  payload['deleted_at'] = typeof deletedAt === 'string' ? deletedAt : null;

  // An activity without a sample id must send `null`, not omit the column: the partial
  // unique index is `where external_sample_id is not null`, and a manual row is never in
  // it. Every other omitted column is one the migrations default or allow to be absent.
  if (table === 'activities' && payload['external_sample_id'] === undefined) {
    payload['external_sample_id'] = null;
  }

  return payload;
}

/** One SQL row back as the local record it mirrors. `null` when the row has no id. */
function decodeRow(table: SyncTable, raw: unknown): RemoteRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const sql = raw as Record<string, unknown>;
  const id = sql['id'];
  if (typeof id !== 'string' || id === '') return null;

  const values: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(COLUMNS[table])) {
    if (!(column in sql)) continue;
    const decode = DECODE[`${table}.${column}`];
    values[field] = decode === undefined ? sql[column] : decode(sql[column]);
  }
  // An absent sample id is written as an omitted key, never as `null` (§5.1): the unique
  // index would otherwise hold a row the document says is not in it.
  if (table === 'activities' && values['externalSampleId'] === null) {
    delete values['externalSampleId'];
  }

  return {
    table,
    rowId: id,
    rev: typeof sql['rev'] === 'number' ? sql['rev'] : 1,
    updatedAt: instantOf(sql['updated_at']) ?? 0,
    deletedAt: instantOf(sql['deleted_at']),
    values: values satisfies SyncRowValues,
  };
}

/** A `timestamptz` as epoch milliseconds, or `null` when it is absent. */
function instantOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** The production remote, given the one configured client. */
export function supabaseRemote(
  client: SupabaseClient<Database>,
  options: SupabaseSyncRemoteOptions = {},
): SyncRemote {
  return new SupabaseSyncRemote(client, options);
}

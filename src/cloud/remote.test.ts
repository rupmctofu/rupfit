/**
 * The Supabase push, pinned as arguments instead of HTTP — spec S3 (RLS) and S4.
 *
 * The owner's project answered `201` to a bare `POST /rest/v1/exercises` and
 * `42501 new row violates row-level security policy` to the same rows sent through
 * `supabase-js`. The schema was right; the request was not:
 *
 * - `supabase-js` turns every array payload into a `columns` query parameter, listing the
 *   union of the payload keys, so PostgREST inserts exactly those columns for every row;
 * - a key that is absent from a *row* (or present with `undefined`, which JSON drops)
 *   arrives as `NULL`, not as its `DEFAULT`, unless the request also asks for
 *   `Prefer: missing=default`;
 * - `user_id` was therefore `NULL`, and `with check (auth.uid() = user_id)` rejected the
 *   very insert the column's `default auth.uid()` was there to allow.
 *
 * So these tests assert the two things that keep the policy satisfiable without touching
 * it: every row carries the signed-in `user_id`, and the client is told to let missing
 * columns take their defaults. Everything runs against a recorded fake client; nothing
 * here opens a socket.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types';
import { SupabaseSyncRemote } from './remote';
import type { PushRow, SyncTable, SyncRowValues } from './types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

interface UpsertOptions {
  readonly onConflict: string;
  readonly defaultToNull: boolean;
}

interface RecordedUpsert {
  readonly table: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly options: UpsertOptions;
}

/**
 * The slice of the client `remote.ts` uses, recorded verbatim: the payload it sends and
 * the options it sends with it. `select` throws because a push that asked for a
 * representation would be a different request than the one these tests pin.
 */
class FakeClient {
  readonly upserts: RecordedUpsert[] = [];
  readonly selects: string[] = [];
  sessionUserId: string | null = USER_ID;
  /** Table whose upsert answers with the owner's real RLS rejection. */
  rejectTable: string | null = null;
  /** Table whose upsert throws instead of answering, as a dropped socket does. */
  throwTable: string | null = null;
  private reads = 0;

  readonly auth = {
    getSession: (): Promise<{
      readonly data: { readonly session: { readonly user: { readonly id: string } } | null };
      readonly error: null;
    }> => {
      this.reads += 1;
      const id = this.sessionUserId;
      return Promise.resolve({
        data: { session: id === null ? null : { user: { id } } },
        error: null,
      });
    },
  };

  sessionReads(): number {
    return this.reads;
  }

  from(table: string): {
    upsert(
      rows: readonly Record<string, unknown>[],
      options: UpsertOptions,
    ): Promise<{ readonly error: { readonly message: string } | null }>;
    select(columns: string): never;
  } {
    return {
      upsert: (rows, options) => {
        this.upserts.push({
          table,
          rows: rows.map((row) => ({ ...row })),
          options,
        });
        if (this.throwTable === table) return Promise.reject(new Error('socket closed'));
        const error =
          this.rejectTable === table
            ? { message: `new row violates row-level security policy for table "${table}"` }
            : null;
        return Promise.resolve({ error });
      },
      select: (columns: string): never => {
        this.selects.push(`${table}.${columns}`);
        throw new Error(`push requested a representation of ${table}`);
      },
    };
  }
}

function remote(client: FakeClient): SupabaseSyncRemote {
  return new SupabaseSyncRemote(client as unknown as SupabaseClient<Database>);
}

let rev = 0;

function row(table: SyncTable, rowId: string, values: SyncRowValues = {}): PushRow {
  rev += 1;
  return { id: `${table}:${rowId}:${rev}`, table, rowId, op: 'upsert', rev, values };
}

const EXERCISE: SyncRowValues = {
  name: 'Sentadilla',
  primaryMuscle: 'quadriceps',
  pattern: 'squat',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: 0,
  isArchived: 0,
  secondaryMuscles: [],
  alternatives: [],
};

describe('pushRows, the request it actually sends', () => {
  it('sends the session user id in the payload of every table', async () => {
    const client = new FakeClient();
    const tables: readonly SyncTable[] = ['profiles', 'exercises', 'sets', 'activities'];
    const rows = tables.map((table) => row(table, `${table}-1`));

    const outcome = await remote(client).pushRows(rows);

    expect(outcome).toEqual({ acknowledged: rows.map((one) => one.id), error: null });
    expect(client.upserts.map((call) => call.table)).toEqual([...tables]);
    for (const call of client.upserts) {
      expect(call.rows).toHaveLength(1);
      for (const payload of call.rows) {
        expect(payload['user_id']).toBe(USER_ID);
      }
    }
  });

  it('asks the server to fill the columns a row leaves out from their defaults', async () => {
    const client = new FakeClient();

    await remote(client).pushRows([row('exercises', 'exercise-1', EXERCISE)]);

    const call = client.upserts[0];
    expect(call?.options).toEqual({ onConflict: 'id', defaultToNull: false });
    // No representation is requested, so no response payload can widen this request.
    expect(client.selects).toEqual([]);
  });

  it('sends the columns the row carries and lets the trigger own the timestamps', async () => {
    const client = new FakeClient();

    await remote(client).pushRows([row('exercises', 'exercise-1', EXERCISE)]);

    const payload = client.upserts[0]?.rows[0] ?? {};
    expect(payload).toMatchObject({
      // Owner-scoped remote id: two accounts cannot collide on a local id like «profile».
      id: `${USER_ID}:exercise-1`,
      user_id: USER_ID,
      name: 'Sentadilla',
      primary_muscle: 'quadriceps',
      load_increment_kg: 2.5,
      is_archived: false,
      deleted_at: null,
    });
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('reads the session once for a batch, not once per row or per table', async () => {
    const client = new FakeClient();

    await remote(client).pushRows([
      row('profiles', 'profile-1'),
      row('exercises', 'exercise-1', EXERCISE),
      row('exercises', 'exercise-2', EXERCISE),
    ]);

    expect(client.sessionReads()).toBe(1);
  });

  it('re-pushes the same row as the same row: identical payload, identical options', async () => {
    const client = new FakeClient();
    const sync = remote(client);
    const first = row('exercises', 'exercise-1', EXERCISE);
    const again: PushRow = { ...first, id: `${first.id}-retry` };

    await sync.pushRows([first]);
    await sync.pushRows([again]);

    expect(client.upserts).toHaveLength(2);
    expect(client.upserts[1]?.rows).toEqual(client.upserts[0]?.rows);
    expect(client.upserts[1]?.options).toEqual(client.upserts[0]?.options);
    // One row, because the identity the server conflicts on is the app id.
    expect(client.upserts[1]?.rows[0]?.['id']).toBe(`${USER_ID}:exercise-1`);
  });

  it('sends no other account than the session\'s, even if a row asks for it', async () => {
    const client = new FakeClient();

    await remote(client).pushRows([
      row('exercises', 'exercise-1', { ...EXERCISE, userId: OTHER_USER_ID, user_id: OTHER_USER_ID }),
    ]);

    expect(client.upserts[0]?.rows[0]?.['user_id']).toBe(USER_ID);
  });

  it('treats an account id that is not a uuid-shaped value as no account at all', async () => {
    const client = new FakeClient();
    client.sessionUserId = '';

    const outcome = await remote(client).pushRows([row('exercises', 'exercise-1', EXERCISE)]);

    expect(outcome.acknowledged).toEqual([]);
    expect(outcome.error).toContain('sign in');
    // The request that could have carried `user_id: ''` — and failed the insert policy —
    // is never built.
    expect(client.upserts).toEqual([]);
  });

  it('keeps the owner on every row of a batch whose rows carry different columns', async () => {
    const client = new FakeClient();

    await remote(client).pushRows([
      row('exercises', 'exercise-1', EXERCISE),
      row('exercises', 'exercise-2', { name: 'Plancha', primaryMuscle: 'core' }),
    ]);

    const rows = client.upserts[0]?.rows ?? [];
    expect(rows).toHaveLength(2);
    for (const payload of rows) expect(payload['user_id']).toBe(USER_ID);
    expect(rows[1]).not.toHaveProperty('is_archived');
    expect(client.upserts[0]?.options.defaultToNull).toBe(false);
  });

  it('answers with a value, not a throw, when there is no signed-in account', async () => {
    const client = new FakeClient();
    client.sessionUserId = null;

    const outcome = await remote(client).pushRows([row('exercises', 'exercise-1', EXERCISE)]);

    expect(outcome.acknowledged).toEqual([]);
    expect(outcome.error).toContain('sign in');
    expect(client.upserts).toEqual([]);
  });

  it('answers with a value when the session read fails', async () => {
    const client = new FakeClient();
    const broken = {
      auth: {
        getSession: () => Promise.reject(new Error('offline')),
      },
      from: client.from.bind(client),
    };

    const outcome = await new SupabaseSyncRemote(
      broken as unknown as SupabaseClient<Database>,
    ).pushRows([row('exercises', 'exercise-1', EXERCISE)]);

    expect(outcome).toEqual({ acknowledged: [], error: 'offline' });
  });

  it('acknowledges only the tables that committed', async () => {
    const client = new FakeClient();
    client.rejectTable = 'exercises';
    const profile = row('profiles', 'profile-1');
    const exercise = row('exercises', 'exercise-1', EXERCISE);

    const outcome = await remote(client).pushRows([profile, exercise]);

    expect(outcome.acknowledged).toEqual([profile.id]);
    expect(outcome.error).toContain('exercises: new row violates row-level security policy');
    // Tables after the failure were never sent.
    expect(client.upserts.map((call) => call.table)).toEqual(['profiles', 'exercises']);
  });

  it('turns a throw into an error value for the table that threw', async () => {
    const client = new FakeClient();
    client.throwTable = 'sets';

    const outcome = await remote(client).pushRows([row('sets', 'set-1')]);

    expect(outcome).toEqual({ acknowledged: [], error: 'sets: socket closed' });
  });

  it('does not touch the client when there is nothing to push', async () => {
    const client = new FakeClient();

    const outcome = await remote(client).pushRows([]);

    expect(outcome).toEqual({ acknowledged: [], error: null });
    expect(client.upserts).toEqual([]);
    expect(client.sessionReads()).toBe(0);
  });
});

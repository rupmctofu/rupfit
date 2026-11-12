/**
 * Profile and single-row meta records — docs/data-model.md §5.1.
 *
 * `meta` holds the three fixed domain keys: `profile`, `phaseState` and `storage`. The
 * first two are domain state, appear in the backup document and are mirrored to the
 * account; `storage` is the recorded answer to `navigator.storage.persist()` (Q-4) and
 * never leaves the device, so it is the one value written without sync metadata.
 *
 * The profile and the phase state are stamped and queued like every other row
 * (odd/tasks/cloud-sync.md T3): they are single-row records, not a special case.
 *
 * The week of the match (T3) takes the device-local branch instead, exactly like the
 * storage answer: a plain `put`, no stamp, no queued op. It is a plan for this phone, not
 * history, and it is deliberately outside the backup document — a restore replaces the
 * whole store, so the week record dies with the restore and the next week is planned
 * again. Nothing here may be lifted into the sync path without a server column for it.
 */

import { META_KEYS } from '../constants';
import type { Database } from '../db';
import { StorageError } from '../errors';
import type { PhaseState, StorageAnswer, UserProfile, WeekRecord } from '../entities';
import {
  isTombstone,
  phaseStateFromStored,
  phaseStateToMetaRow,
  profileToMetaRow,
  storageAnswerToMetaRow,
  weekRecordFromStored,
  weekRecordToMetaRow,
} from '../mappers';
import type { MetaRepositoryPort, ProfileRepositoryPort } from '../port';
import { writeStamped, type RowSyncDeps } from '../sync';

export class ProfileRepository implements ProfileRepositoryPort {
  constructor(
    private readonly database: Database,
    private readonly sync: RowSyncDeps,
  ) {}

  async read(): Promise<UserProfile | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.profile);
      return row !== undefined && row.key === 'profile' && !isTombstone(row)
        ? row.value
        : undefined;
    });
  }

  async save(profile: UserProfile): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      await writeStamped({
        ...this.sync,
        tx,
        table: 'profiles',
        key: META_KEYS.profile,
        row: profileToMetaRow(profile),
      });
    });
  }
}

export class MetaRepository implements MetaRepositoryPort {
  constructor(
    private readonly database: Database,
    private readonly sync: RowSyncDeps,
  ) {}

  async readPhaseState(): Promise<PhaseState | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.phaseState);
      return row !== undefined && row.key === 'phaseState' && !isTombstone(row)
        ? phaseStateFromStored(row.value)
        : undefined;
    });
  }

  async savePhaseState(state: PhaseState): Promise<void> {
    if (!Number.isInteger(state.block) || state.block < 1 || state.block > 4) {
      throw new StorageError('invalid', 'The readaptation block is 1..4.', { block: state.block });
    }
    await this.database.write(['meta'], async (tx) => {
      await writeStamped({
        ...this.sync,
        tx,
        table: 'phase_state',
        key: META_KEYS.phaseState,
        row: phaseStateToMetaRow(state),
      });
    });
  }

  async readStorageAnswer(): Promise<StorageAnswer | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.storage);
      return row !== undefined && row.key === 'storage' ? row.value : undefined;
    });
  }

  /**
   * Q-4: device-local evidence about this browser's storage, not account data. Writing it
   * must not queue anything — a sync push has no column for it and never will.
   */
  async saveStorageAnswer(answer: StorageAnswer): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      await tx.objectStore('meta').put(storageAnswerToMetaRow(answer));
    });
  }

  async readWeek(): Promise<WeekRecord | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.week);
      return row !== undefined && row.key === 'week' ? weekRecordFromStored(row.value) : undefined;
    });
  }

  /**
   * T3, device-local: the same plain `put` as the storage answer. A week is a plan for
   * this phone, so it is not stamped and not queued — and a restore, which clears `meta`,
   * takes it with it.
   */
  async saveWeek(week: WeekRecord): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      await tx.objectStore('meta').put(weekRecordToMetaRow(week));
    });
  }
}

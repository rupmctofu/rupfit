/**
 * Profile and single-row meta records — docs/data-model.md §5.1.
 *
 * `meta` holds exactly three fixed keys: `profile`, `phaseState` and `storage`. The
 * first two are domain state and appear in the backup document; `storage` is the
 * recorded answer to `navigator.storage.persist()` (Q-4) and never leaves the device.
 */

import { META_KEYS } from '../constants';
import type { Database } from '../db';
import { StorageError } from '../errors';
import type { PhaseState, StorageAnswer, UserProfile } from '../entities';
import { phaseStateFromStored, phaseStateToMetaRow, profileToMetaRow, storageAnswerToMetaRow } from '../mappers';
import type { MetaRepositoryPort, ProfileRepositoryPort } from '../port';

export class ProfileRepository implements ProfileRepositoryPort {
  constructor(private readonly database: Database) {}

  async read(): Promise<UserProfile | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.profile);
      return row !== undefined && row.key === 'profile' ? row.value : undefined;
    });
  }

  async save(profile: UserProfile): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      await tx.objectStore('meta').put(profileToMetaRow(profile));
    });
  }
}

export class MetaRepository implements MetaRepositoryPort {
  constructor(private readonly database: Database) {}

  async readPhaseState(): Promise<PhaseState | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.phaseState);
      return row !== undefined && row.key === 'phaseState'
        ? phaseStateFromStored(row.value)
        : undefined;
    });
  }

  async savePhaseState(state: PhaseState): Promise<void> {
    if (!Number.isInteger(state.block) || state.block < 1 || state.block > 4) {
      throw new StorageError('invalid', 'The readaptation block is 1..4.', { block: state.block });
    }
    await this.database.write(['meta'], async (tx) => {
      await tx.objectStore('meta').put(phaseStateToMetaRow(state));
    });
  }

  async readStorageAnswer(): Promise<StorageAnswer | undefined> {
    return this.database.read(['meta'], async (tx) => {
      const row = await tx.objectStore('meta').get(META_KEYS.storage);
      return row !== undefined && row.key === 'storage' ? row.value : undefined;
    });
  }

  async saveStorageAnswer(answer: StorageAnswer): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      await tx.objectStore('meta').put(storageAnswerToMetaRow(answer));
    });
  }
}

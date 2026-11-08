/**
 * The storage-persistence probe — docs/data-model.md Q-4 and architecture §2.3 P-8.
 *
 * `navigator.storage.persist()` is absent in WebKit, so on the owner's iPhone the
 * honest answer is "unknown". It is probed at most once per launch, recorded in the
 * `meta` single-row record, and never prompted for: there is nothing to request.
 */

import type { EpochMs, StorageAnswer } from '../entities';
import type { StoragePort } from '../port';

interface PersistCapableNavigator {
  readonly storage?: {
    persist?(): Promise<boolean>;
    persisted?(): Promise<boolean>;
  };
}

/**
 * Asks the browser once and records the answer. A browser without the API records
 * `null` — not `false`, because "cannot be asked" is not "refused" (§1.6).
 */
export async function probeStoragePersistence(
  storage: StoragePort,
  now: EpochMs,
): Promise<StorageAnswer> {
  const navigatorLike = (globalThis as unknown as { navigator?: PersistCapableNavigator }).navigator;
  const api = navigatorLike?.storage;

  let persisted: boolean | null = null;
  try {
    if (api?.persist !== undefined) {
      persisted = await api.persist();
    } else if (api?.persisted !== undefined) {
      persisted = await api.persisted();
    }
  } catch {
    // A refused or unavailable probe is not an error the user needs to see.
    persisted = null;
  }

  const answer: StorageAnswer = { persisted, checkedAt: now };
  await storage.meta.saveStorageAnswer(answer);
  return answer;
}

/**
 * Plan repository — the weekday template of docs/data-model.md §5.1 (`planDays`,
 * `planItems`) and the prescriptions it carries.
 *
 * The prescription of a *performed* exercise lives in `exerciseSessions` and is frozen
 * (I-2). This store is the template the next session is generated from; editing it
 * never rewrites a started or finished session (Q-2).
 */

import { prefixKeyRange, type Database } from '../db';
import { StorageError } from '../errors';
import type { PlanDay, Uuid } from '../entities';
import { planDayFromRow, planDayToRow, planItemToRow } from '../mappers';
import type { PlanItemRow } from '../records';
import type { PlanRepositoryPort } from '../port';

const PLAN_STORES = ['planDays', 'planItems'] as const;

export class PlanRepository implements PlanRepositoryPort {
  constructor(private readonly database: Database) {}

  async all(): Promise<readonly PlanDay[]> {
    return this.database.read(PLAN_STORES, async (tx) => {
      const rows = await tx.objectStore('planDays').index('by_order').getAll();
      const items = tx.objectStore('planItems').index('by_planDay_order');

      const days: PlanDay[] = [];
      for (const row of rows) {
        const dayItems = await items.getAll(prefixKeyRange(row.id));
        days.push(planDayFromRow(row, dayItems));
      }
      return days;
    });
  }

  async byId(id: Uuid): Promise<PlanDay | undefined> {
    return this.database.read(PLAN_STORES, async (tx) => {
      const row = await tx.objectStore('planDays').get(id);
      if (row === undefined) return undefined;
      const items = await tx
        .objectStore('planItems')
        .index('by_planDay_order')
        .getAll(prefixKeyRange(id));
      return planDayFromRow(row, items);
    });
  }

  async save(day: PlanDay): Promise<void> {
    await this.database.write(PLAN_STORES, async (tx) => {
      const days = tx.objectStore('planDays');
      const items = tx.objectStore('planItems');
      const index = items.index('by_planDay_order');

      await days.put(planDayToRow(day));

      // Replaced, not merged: a removed item must not linger. The deletes and the
      // writes are in this same transaction, so the day is never half-edited.
      const existing = await index.getAll(prefixKeyRange(day.id));
      const keep = new Set(day.items.map((item) => item.id));
      for (const row of existing) {
        if (!keep.has(row.id)) await items.delete(row.id);
      }

      for (const item of day.items) {
        const row: PlanItemRow = planItemToRow(item);
        if (row.planDayId !== day.id) {
          throw new StorageError(
            'invalid',
            `Plan item ${item.id} belongs to ${row.planDayId}, not to the day being saved (${day.id}).`,
            { planItemId: item.id },
          );
        }
        await items.put(row);
      }
    });
  }

  async remove(id: Uuid): Promise<void> {
    await this.database.write(PLAN_STORES, async (tx) => {
      const items = tx.objectStore('planItems');
      const rows = await items.index('by_planDay_order').getAll(prefixKeyRange(id));
      for (const row of rows) {
        await items.delete(row.id);
      }
      await tx.objectStore('planDays').delete(id);
    });
  }
}


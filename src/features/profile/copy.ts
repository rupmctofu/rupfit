/**
 * The Spanish words of Perfil, and the two defaults the screen needs.
 *
 * Identifiers are English and the copy is Spanish (task rules); this is the one file
 * where the second one is written down, so a label is never invented inside a JSX
 * expression where nobody would find it again.
 */

import type { Equipment } from '../../core/domain';
import type { MassUnit, UserProfile, WeightGoal } from '../../storage';

/**
 * The version the backup document declares (`appVersion`, §9). The package version of
 * this build; bumping it is a release step, not a runtime read of `package.json`.
 */
export const APP_VERSION = '0.1.0';

export const MASS_UNITS: readonly MassUnit[] = ['kilograms', 'pounds'];

export const MASS_UNIT_WORD: Record<MassUnit, string> = {
  kilograms: 'Kilogramos',
  pounds: 'Libras',
};

export const WEIGHT_GOALS: readonly WeightGoal[] = ['maintain', 'lose', 'gain'];

export const WEIGHT_GOAL_WORD: Record<WeightGoal, string> = {
  maintain: 'Mantener peso',
  lose: 'Perder peso',
  gain: 'Ganar peso',
};

/** Same words as the session card, so one piece of equipment has one name. */
export const EQUIPMENT_WORD: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda',
};

/** `Mantener peso · 4 equipos` — the muted line under the profile card. */
export function goalsLine(profile: UserProfile | null): string {
  if (profile === null) return 'Sin perfil';
  const goal = profile.weightGoal === null ? 'Sin objetivo de peso' : WEIGHT_GOAL_WORD[profile.weightGoal];
  const equipment =
    profile.availableEquipment.length === 1
      ? '1 equipo'
      : `${profile.availableEquipment.length} equipos`;
  return `${goal} · ${equipment}`;
}

/**
 * The starting profile of FR-1.1, with the entries Perfil can change. The equipment is
 * a gym's, which the artboard already assumes ("Plan de 3 días · gimnasio"), and it is
 * editable right below the button that creates it.
 */
export function defaultProfile(id: string): UserProfile {
  return {
    id,
    displayName: null,
    massUnit: 'kilograms',
    weightGoal: null,
    weeklyTrainingDays: 3,
    availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
    autoStartRestTimer: true,
  };
}

/** §7.8: the health empty state. Informational, never blocking, never "denied". */
export const HEALTH_NOTE = 'Todavía no hay datos de salud importados. Esto no impide entrenar.';

/** The second line that keeps the note honest about what this app does not do. */
export const HEALTH_DETAIL =
  'Rupfit no lee Apple Health y no hay app para el reloj. Los pesos y las actividades solo pueden entrar en una copia importada.';

/** §11: the sentence the storage group has to say out loud. */
export const DURABILITY_NOTE =
  'Safari puede borrar estos datos. La copia exportada es la única copia duradera.';

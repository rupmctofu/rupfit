/**
 * Perfil renders — the identity card, checked as markup.
 *
 * Same discipline as `HomeScreen.test.tsx`: no DOM environment, no interaction faked, the
 * screen's *output* is what is pinned with `renderToStaticMarkup`. `ProfileSection` is the
 * screen's identity card and the only part that prints the owner's name; the rest of Perfil
 * reads the store, the browser and the network, so it is exercised where it actually lives.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UserProfile } from '../../storage';
import { ProfileSection } from './ProfileScreen';

/** The profile the app finds on a device that signed in before S4: the derived handle. */
const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'robertovlopez',
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell'],
  autoStartRestTimer: true,
};

function card(profile: UserProfile | null): string {
  return renderToStaticMarkup(
    <ProfileSection
      profile={profile}
      saveFailed={false}
      onWrite={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

/* ----------------------------------------------------------------------------
 * S4 (odd/tasks/home-feedback.md) — the name is the app's and it is not editable.
 *
 * The owner asked for `Rup` and for it to stop being a field: «pon rup y que no sea
 * editable». The stored `displayName` stays in the model and in the copy; what changes is
 * what the card prints and that there is nothing left to type into.
 * ------------------------------------------------------------------------- */

describe('the name Perfil draws (S4)', () => {
  it('prints Rup, not the stored name, and offers no field to change it', () => {
    const markup = card(PROFILE);

    expect(markup).toContain('Rup');
    expect(markup).not.toContain('robertovlopez');
    // Nothing to type a name into: no input, no textarea, no commit button.
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('Guardar');
  });

  it('keeps printing Rup for a profile that never had a name, and still offers no field', () => {
    const markup = card({ ...PROFILE, displayName: null });

    expect(markup).toContain('Rup');
    expect(markup).not.toContain('<input');
  });
});

/**
 * Installed or in a tab — architecture §2.1.1, design-system §2.5 and §7.8.
 *
 * The answer comes from two sources because iOS has answered through the Apple flag
 * and through the display-mode media query on different versions. It is advisory:
 * nothing here changes what the app does, only what it says about itself.
 */

import { describe, expect, it } from 'vitest';
import { appMode, installState, type InstalledProbe } from './device-mode';

const TAB: InstalledProbe = { displayModeStandalone: false, navigatorStandalone: false };

describe('appMode', () => {
  it('reads a Safari tab when neither source says installed', () => {
    expect(appMode(TAB)).toBe('tab');
  });

  it('reads the display-mode media query the shell is styled for', () => {
    expect(appMode({ displayModeStandalone: true, navigatorStandalone: false })).toBe('installed');
  });

  it('reads the Apple flag on the iOS versions that answer there', () => {
    expect(appMode({ displayModeStandalone: false, navigatorStandalone: true })).toBe('installed');
  });
});

describe('installState', () => {
  it('states the installed mode as a fact and shows no advisory', () => {
    const state = installState({ displayModeStandalone: true, navigatorStandalone: false });

    expect(state.mode).toBe('installed');
    expect(state.word).toBe('Instalada');
    expect(state.advisory).toBeNull();
    expect(state.emphasiseExport).toBe(false);
  });

  it('shows the two install taps as copy, because Safari exposes no install API (P-11)', () => {
    const state = installState(TAB);

    expect(state.mode).toBe('tab');
    expect(state.word).toBe('En una pestaña de Safari');
    expect(state.advisory?.title).toBe(
      'Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos.',
    );
    expect(state.advisory?.text).toBe('Compartir → Añadir a pantalla de inicio');
  });

  it('emphasises the export while the app is not installed (§2.5)', () => {
    expect(installState(TAB).emphasiseExport).toBe(true);
  });
});

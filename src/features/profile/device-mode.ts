/**
 * Installed or in a tab — architecture §2.1.1, design-system §2.5 and §7.8.
 *
 * Two sources, because iOS has answered through the Apple flag and through the
 * display-mode media query on different versions. The answer is advisory: nothing the
 * app does changes with it, only what it says about itself, and it never becomes a
 * modal, never blocks training and never promises an install API that does not exist
 * (P-11: there is no `beforeinstallprompt` on iOS).
 *
 * The word and the advisory copy are the approved ones: `Instalada` /
 * `En una pestaña de Safari`, and the sentence of §7.8.
 */

export interface InstalledProbe {
  /** `matchMedia('(display-mode: standalone)').matches` */
  readonly displayModeStandalone: boolean;
  /** `navigator.standalone`, the Apple-only flag. */
  readonly navigatorStandalone: boolean;
}

export type AppMode = 'installed' | 'tab';

export function appMode(probe: InstalledProbe): AppMode {
  return probe.displayModeStandalone || probe.navigatorStandalone ? 'installed' : 'tab';
}

export interface InstallAdvisory {
  readonly title: string;
  /** The two taps, as copy: Safari exposes no programmatic install (P-11). */
  readonly text: string;
}

export interface InstallState {
  readonly mode: AppMode;
  /** `Instalada` / `En una pestaña de Safari` — the mode, stated once (§2.5). */
  readonly word: string;
  /** `null` when installed: there is nothing to advise. */
  readonly advisory: InstallAdvisory | null;
  /** §2.5: the export affordance is emphasised while the app is not installed. */
  readonly emphasiseExport: boolean;
}

export function installState(probe: InstalledProbe): InstallState {
  const mode = appMode(probe);

  if (mode === 'installed') {
    return { mode, word: 'Instalada', advisory: null, emphasiseExport: false };
  }

  return {
    mode,
    word: 'En una pestaña de Safari',
    advisory: {
      title: 'Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos.',
      text: 'Compartir → Añadir a pantalla de inicio',
    },
    emphasiseExport: true,
  };
}

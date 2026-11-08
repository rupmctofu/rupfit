/**
 * The update decision — design-system §7.8, ADR-012, architecture §2.2 P-4/P-9.
 *
 * One rule decides everything: an update never replaces the running app under the
 * owner's thumb, so `Actualizar ahora` is disabled while a session is running. The
 * screen only draws what this returns, which is what keeps the banner and the button
 * from disagreeing.
 *
 * The copy states what the app actually does — reload — and not the "se aplicará al
 * terminar la sesión" of §7.8, which presumes an automatic application at the end of a
 * session. That hook belongs to the session screen and to `src/pwa/`; until it exists,
 * saying it would be a promise the app does not keep.
 */

export interface UpdateInputs {
  /** A service worker is installed and waiting to take over (§8, `registerType: prompt`). */
  readonly waiting: boolean;
  /** A session is in progress, read from storage, not from memory. */
  readonly sessionRunning: boolean;
  /** The owner already tapped: the page is about to reload. */
  readonly applying: boolean;
}

export type UpdatePhase = 'idle' | 'available' | 'blocked' | 'applying';

export interface UpdateState {
  readonly phase: UpdatePhase;
  readonly title: string | null;
  readonly text: string | null;
  readonly actionLabel: string | null;
  readonly actionEnabled: boolean;
}

const IDLE: UpdateState = {
  phase: 'idle',
  title: null,
  text: null,
  actionLabel: null,
  actionEnabled: false,
};

export function updateState(inputs: UpdateInputs): UpdateState {
  if (!inputs.waiting) return IDLE;

  const title = 'Hay una versión nueva.';

  if (inputs.applying) {
    return {
      phase: 'applying',
      title,
      text: 'Actualizando… La app se recarga; los datos ya están guardados.',
      actionLabel: 'Actualizando…',
      actionEnabled: false,
    };
  }

  if (inputs.sessionRunning) {
    return {
      phase: 'blocked',
      title,
      text: 'Termina o sal de la sesión para actualizar: no se interrumpe un entrenamiento en curso.',
      actionLabel: 'Actualizar ahora',
      actionEnabled: false,
    };
  }

  return {
    phase: 'available',
    title,
    text: 'Se aplica al recargar. No se pierde nada: todo está guardado.',
    actionLabel: 'Actualizar ahora',
    actionEnabled: true,
  };
}

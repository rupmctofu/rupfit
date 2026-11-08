/**
 * The update decision — design-system §7.8 (`Actualizar ahora` is disabled while a
 * session is running, ADR-012) and docs/design-system.md §2.2 P-4.
 *
 * The state is a decision, not a message: the screen only draws what this returns,
 * so the rule "an update never replaces the app under the owner's thumb" is tested
 * once and cannot drift between the banner and the button.
 */

import { describe, expect, it } from 'vitest';
import { updateState } from './update-state';

describe('updateState', () => {
  it('says nothing when no service worker is waiting', () => {
    const state = updateState({ waiting: false, sessionRunning: false, applying: false });

    expect(state.phase).toBe('idle');
    expect(state.title).toBeNull();
    expect(state.text).toBeNull();
    expect(state.actionLabel).toBeNull();
    expect(state.actionEnabled).toBe(false);
  });

  it('offers the update when nothing is running', () => {
    const state = updateState({ waiting: true, sessionRunning: false, applying: false });

    expect(state.phase).toBe('available');
    expect(state.actionLabel).toBe('Actualizar ahora');
    expect(state.actionEnabled).toBe(true);
    expect(state.title).toBe('Hay una versión nueva.');
  });

  it('keeps the action disabled while a session is running', () => {
    const state = updateState({ waiting: true, sessionRunning: true, applying: false });

    expect(state.phase).toBe('blocked');
    expect(state.actionLabel).toBe('Actualizar ahora');
    expect(state.actionEnabled).toBe(false);
    expect(state.text).toContain('sesión');
  });

  it('never promises an automatic application it does not perform', () => {
    for (const sessionRunning of [true, false]) {
      const state = updateState({ waiting: true, sessionRunning, applying: false });
      expect(state.text).not.toContain('Se aplicará al terminar');
    }
  });

  it('reports applying once the owner tapped, and refuses a second tap', () => {
    const state = updateState({ waiting: true, sessionRunning: false, applying: true });

    expect(state.phase).toBe('applying');
    expect(state.actionLabel).toBe('Actualizando…');
    expect(state.actionEnabled).toBe(false);
  });

  it('is idle when nothing is waiting even if a tap was recorded', () => {
    const state = updateState({ waiting: false, sessionRunning: false, applying: true });

    expect(state.phase).toBe('idle');
    expect(state.actionEnabled).toBe(false);
  });
});

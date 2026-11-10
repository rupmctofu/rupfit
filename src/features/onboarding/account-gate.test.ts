/**
 * Cuando la app pide la cuenta antes de Inicio — la tabla de L2, en cuatro casos.
 *
 * El cuarto (una respuesta que no llega) existe para que la app no pueda quedarse en
 * blanco esperando a un proveedor que no contesta: sin bloquear, se entra.
 */

import { describe, expect, it } from 'vitest';
import type { AccountSession } from '../../cloud/auth';
import { accountOffer, type AccountGateInput } from './account-gate';

const SIGNED_IN: AccountSession = {
  status: 'signed-in',
  email: 'rub@correo.es',
  metadataName: null,
};

const SIGNED_OUT: AccountSession = { status: 'signed-out', email: null, metadataName: null };

function input(overrides: Partial<AccountGateInput> = {}): AccountGateInput {
  return { configured: true, dismissed: false, account: SIGNED_OUT, unavailable: false, ...overrides };
}

describe('accountOffer', () => {
  it('entra sin preguntar cuando la sesión está restaurada', () => {
    expect(accountOffer(input({ account: SIGNED_IN }))).toEqual({ kind: 'open', reason: 'signedIn' });
  });

  it('pide la cuenta cuando hay proyecto y ninguna sesión', () => {
    expect(accountOffer(input())).toEqual({ kind: 'ask' });
  });

  it('no pregunta nada cuando esta copia no tiene proyecto', () => {
    expect(accountOffer(input({ configured: false, account: null }))).toEqual({
      kind: 'open',
      reason: 'unconfigured',
    });
  });

  it('no vuelve a preguntar cuando el dueño dijo que sigue sin cuenta', () => {
    expect(accountOffer(input({ dismissed: true }))).toEqual({ kind: 'open', reason: 'dismissed' });
    // Ni siquiera con una sesión delante: la decisión de esta sesión ya está tomada.
    expect(accountOffer(input({ dismissed: true, account: SIGNED_IN }))).toEqual({
      kind: 'open',
      reason: 'dismissed',
    });
  });

  it('espera la primera respuesta en vez de enseñar el formulario', () => {
    expect(accountOffer(input({ account: null }))).toEqual({ kind: 'waiting' });
  });

  it('entra cuando la respuesta no puede llegar', () => {
    expect(accountOffer(input({ account: null, unavailable: true }))).toEqual({
      kind: 'open',
      reason: 'unavailable',
    });
  });

  it('entra si el servicio dice que no hay proyecto aunque la copia esté configurada', () => {
    expect(
      accountOffer(input({ account: { status: 'unconfigured', email: null, metadataName: null } })),
    ).toEqual({ kind: 'open', reason: 'unconfigured' });
  });
});

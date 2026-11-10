/**
 * El nombre de la cuenta: la tabla de derivación de L3 y la regla de escritura.
 *
 * Lo que se fija aquí es que el nombre salga siempre de la cuenta y que el perfil no se
 * pise nunca: ni el nombre que puso el dueño, ni el que ya está escrito.
 */

import { describe, expect, it } from 'vitest';
import { accountNameOf, nameToWrite, type AccountIdentity } from './account-name';

function identity(overrides: Partial<AccountIdentity> = {}): AccountIdentity {
  return { email: null, metadataName: null, ...overrides };
}

describe('accountNameOf', () => {
  it('uses the name the provider carries, as it is', () => {
    expect(accountNameOf(identity({ email: 'roberto.puntow@correo.es', metadataName: 'Roberto Puntow' }))).toBe(
      'Roberto Puntow',
    );
    expect(accountNameOf(identity({ metadataName: '  Rub  ' }))).toBe('Rub');
  });

  it('derives a plain address: the local part, lowercased', () => {
    expect(accountNameOf(identity({ email: 'rub@correo.es' }))).toBe('rub');
    expect(accountNameOf(identity({ email: 'Rub@Correo.es' }))).toBe('rub');
  });

  it('drops the dots and the dashes of the local part', () => {
    expect(accountNameOf(identity({ email: 'roberto.puntow@correo.es' }))).toBe('robertopuntow');
    expect(accountNameOf(identity({ email: 'roberto-puntow@correo.es' }))).toBe('robertopuntow');
    expect(accountNameOf(identity({ email: 'roberto.puntow-2@correo.es' }))).toBe('robertopuntow2');
  });

  it('has no name when there is no address to take it from', () => {
    expect(accountNameOf(identity())).toBeNull();
    expect(accountNameOf(identity({ email: '   ' }))).toBeNull();
    expect(accountNameOf(identity({ email: 'sin-arroba' }))).toBeNull();
    expect(accountNameOf(identity({ email: '@correo.es' }))).toBeNull();
  });

  it('falls back to the address when the provider name is blank', () => {
    expect(accountNameOf(identity({ email: 'rub@correo.es', metadataName: '   ' }))).toBe('rub');
  });
});

describe('nameToWrite', () => {
  it('writes the account name into a profile that has none', () => {
    expect(nameToWrite(null, 'rub')).toBe('rub');
    expect(nameToWrite('', 'rub')).toBe('rub');
    expect(nameToWrite('   ', 'rub')).toBe('rub');
  });

  it('never overwrites the name the owner typed', () => {
    expect(nameToWrite('Roberto', 'rub')).toBeNull();
    expect(nameToWrite('Rub', 'rub')).toBeNull();
  });

  it('writes nothing when the stored name is already the derived one', () => {
    expect(nameToWrite('rub', 'rub')).toBeNull();
  });

  it('writes nothing when there is no name to write', () => {
    expect(nameToWrite(null, '')).toBeNull();
    expect(nameToWrite(null, '   ')).toBeNull();
  });
});

/**
 * El nombre del perfil, tomado de la cuenta al entrar (spec S1, L3).
 *
 * Una vez por sesión firmada, y solo si el perfil no tiene nombre: `nameToWrite` decide, y
 * aquí solo se lee, se escribe y se calla. Tres límites deliberados:
 *
 * - **No espera a nadie.** Corre detrás de la entrada ya abierta; si el almacén no contesta
 *   o falla, no se escribe nada, el perfil se queda como está y Perfil dirá lo que no pudo
 *   leer. Entrenar nunca depende de esto (S4).
 * - **No crea un perfil.** Sin perfil no hay dónde escribir el nombre: el primer arranque
 *   lo pide en su formulario, ya rellenado con el nombre de la cuenta (`SetupScreen`).
 * - **No vuelve a escribir.** Un nombre que ya está no se toca, así que un guardado por
 *   arranque es como mucho un cambio, y solo para un perfil sin nombre.
 */

import { useEffect } from 'react';
import type { StoragePort } from '../../storage';
import type { AccountSession } from '../../cloud/auth';
import { accountNameOf, nameToWrite } from './account-name';

export function useAccountName(storage: StoragePort, account: AccountSession | null): void {
  const derived =
    account !== null && account.status === 'signed-in' ? accountNameOf(account) : null;

  useEffect(() => {
    if (derived === null) return;

    let cancelled = false;
    void (async () => {
      try {
        const profile = await storage.profile.read();
        if (cancelled || profile === undefined) return;

        const next = nameToWrite(profile.displayName, derived);
        if (next === null) return;

        await storage.profile.save({ ...profile, displayName: next });
      } catch {
        // Un perfil que no se puede leer o escribir no es una sesión que no se puede
        // empezar: se deja el nombre como está y la pantalla que lo enseña habla.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [derived, storage]);
}

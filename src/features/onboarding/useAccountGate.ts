/**
 * La puerta de entrada con cuenta: el único sitio donde el shell pregunta por la sesión
 * (spec S1, L2). La decisión es de `accountOffer`; esto solo reúne lo que la decisión
 * necesita.
 *
 * Tres cosas importan, y las tres son sobre no estorbar:
 *
 * - **Sin proyecto no se toca la nube.** `cloudConfig()` se lee primero, y es un valor:
 *   una copia sin `VITE_SUPABASE_URL` contesta «no hay nada que preguntar» sin cargar un
 *   solo byte de `cloud/auth` ni de `@supabase/supabase-js`.
 * - **La primera respuesta decide, y hay un plazo.** `subscribeToAccount` entrega el
 *   `INITIAL_SESSION` guardado, así que una sesión restaurada entra sin ver el formulario.
 *   Si el trozo no se puede cargar, o el proveedor no contesta en `ACCOUNT_ANSWER_BUDGET_MS`,
 *   la puerta se abre: esperar para siempre es la única forma de bloquear el entrenamiento
 *   que esta tarea no puede permitirse (S4).
 * - **`dismiss` es de esta sesión.** Vive en el estado del shell, no en el almacenamiento:
 *   se recuerda hasta cerrar la app y no se escribe nada por negarse (L2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloudConfig } from '../../cloud/config';
import type { AccountSession, AuthPort } from '../../cloud/auth';
import { accountOffer, type AccountOffer } from './account-gate';

/**
 * Cuánto se espera la primera respuesta del proveedor. La lectura de la sesión guardada es
 * local y tarda milisegundos; dos segundos es el margen para un teléfono lento, no una
 * cuenta atrás que el dueño tenga que mirar.
 */
export const ACCOUNT_ANSWER_BUDGET_MS = 2000;

export interface AccountGate {
  readonly offer: AccountOffer;
  /** La cuenta en uso, en cuanto el proveedor contesta. La lee el nombre del perfil. */
  readonly account: AccountSession | null;
  /** El servicio ya cargado, para la pantalla de la entrada. `null` si no se cargó. */
  readonly auth: AuthPort | null;
  /** Lo que exige una contraseña; la copia de la entrada lo dice con este número. */
  readonly passwordMinLength: number | null;
  /** «Seguir sin cuenta»: no se vuelve a preguntar hasta el próximo arranque. */
  readonly dismiss: () => void;
}

/** Fuera de las rutas del tab no se pregunta: la sesión y la galería tienen lo suyo. */
const OFF_ROUTE: AccountOffer = { kind: 'open', reason: 'offRoute' };

export function useAccountGate(enabled: boolean): AccountGate {
  // La configuración es un valor del build: se lee una vez por arranque.
  const configured = useMemo(() => cloudConfig() !== null, []);
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [auth, setAuth] = useState<AuthPort | null>(null);
  const [passwordMinLength, setPasswordMinLength] = useState<number | null>(null);
  // La entrada se pasa una vez por arranque y no vuelve: cerrar sesión en Perfil no
  // devuelve al dueño a un formulario que ya había dejado atrás, igual que el setup no
  // vuelve cuando el almacén ya puede entrenar.
  const passed = useRef(false);

  useEffect(() => {
    // Sin pregunta no hay nada que escuchar, y una copia local no carga el trozo de la nube.
    if (!enabled || !configured || dismissed) return;

    let stopped = false;
    let unsubscribe: (() => void) | null = null;
    let budget: ReturnType<typeof setTimeout> | null = null;

    const giveUp = (): void => {
      if (stopped) return;
      stopped = true;
      if (budget !== null) clearTimeout(budget);
      unsubscribe?.();
      // Abrir es la respuesta honesta: no se puede comprobar la sesión, así que no se pide
      // una contraseña por si acaso (design-system §2.5: no saber no es «no hay»).
      setUnavailable(true);
    };

    budget = setTimeout(giveUp, ACCOUNT_ANSWER_BUDGET_MS);

    void import('../../cloud/auth').then(
      (module) => {
        if (stopped) return;
        setAuth(module.cloudAuth);
        setPasswordMinLength(module.PASSWORD_MIN_LENGTH);
        unsubscribe = module.subscribeToAccount((next) => {
          if (stopped) return;
          // La primera respuesta llegó: el plazo deja de correr.
          if (budget !== null) clearTimeout(budget);
          budget = null;
          // Con sesión, la entrada ya está pasada: lo que venga después (un cierre de sesión
          // en Perfil) no abre otra vez el formulario en este arranque.
          if (passed.current) return;
          if (next.status === 'signed-in') passed.current = true;
          setAccount(next);
        });
      },
      // El trozo no cargó (sin conexión en la primera visita, por ejemplo): se entra.
      giveUp,
    );

    return () => {
      stopped = true;
      if (budget !== null) clearTimeout(budget);
      unsubscribe?.();
    };
  }, [enabled, configured, dismissed]);

  const dismiss = useCallback(() => {
    passed.current = true;
    setDismissed(true);
  }, []);

  const offer: AccountOffer = enabled
    ? accountOffer({ configured, dismissed, account, unavailable })
    : OFF_ROUTE;

  return { offer, account, auth, passwordMinLength, dismiss };
}

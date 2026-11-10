/**
 * Cuando la app pide la cuenta antes de Inicio (spec S1, L2) — la mitad pura de
 * `useAccountGate`.
 *
 * La pregunta es una sola: ¿la entrada es la cuenta o el tab? Y la respuesta tiene tres
 * formas, no dos, porque «todavía no lo sé» no es «no hay sesión»:
 *
 * | lo que hay | lo que se ve |
 * | --- | --- |
 * | el dueño dijo «Seguir sin cuenta» | Inicio |
 * | esta copia no tiene proyecto | Inicio (el modo local de siempre, ADR-0002) |
 * | el proveedor no llegó a contestar | Inicio, porque no bloquear es la regla |
 * | sin la primera respuesta todavía | nada: una espera de un fotograma, nunca un formulario encima de una sesión restaurada |
 * | una sesión restaurada | Inicio, sin ver el formulario |
 * | proyecto y ninguna sesión | la cuenta |
 *
 * «Unreadable is not empty» también vale aquí: no saber si hay sesión no autoriza a pedir
 * una contraseña. Y «Seguir sin cuenta» gana a todo, porque negarse tiene que dejar
 * entrenar (S4): se decide lo que se decide, no se vuelve a preguntar en esta sesión.
 *
 * Sin React, sin almacenamiento, sin nube: la decisión es un valor, y el shell solo la
 * dibuja.
 */

import type { AccountSession } from '../../cloud/auth';

/** Por qué la entrada se abre sin pedir la cuenta. */
export type AccountReason =
  | 'dismissed'
  | 'unconfigured'
  | 'unavailable'
  | 'signedIn'
  /** Una ruta que no es del tab (sesión, resumen, galería): la entrada no se mete. */
  | 'offRoute';

export type AccountOffer =
  /** Ninguna respuesta todavía: la pantalla que decide aún no se dibuja. */
  | { readonly kind: 'waiting' }
  /** Proyecto configurado y ninguna sesión: la cuenta, antes de Inicio. */
  | { readonly kind: 'ask' }
  /** Se entra: Inicio, con lo local intacto y sin preguntar nada más. */
  | { readonly kind: 'open'; readonly reason: AccountReason };

export interface AccountGateInput {
  /** Si esta copia tiene proyecto de Supabase (`cloudConfig() !== null`). */
  readonly configured: boolean;
  /** «Seguir sin cuenta» pulsado en esta sesión. */
  readonly dismissed: boolean;
  /** La primera respuesta del proveedor; `null` mientras no llega. */
  readonly account: AccountSession | null;
  /** `true` cuando la respuesta ya no puede llegar: sin chunk, o con el plazo agotado. */
  readonly unavailable: boolean;
}

export function accountOffer(input: AccountGateInput): AccountOffer {
  // La salida secundaria manda: negarse no deja sin entrenar ni sin los datos (S4, L2).
  if (input.dismissed) return { kind: 'open', reason: 'dismissed' };
  // Sin proyecto no hay nada que preguntar y no se toca la nube en absoluto (ADR-0002).
  if (!input.configured) return { kind: 'open', reason: 'unconfigured' };
  // Una respuesta que no va a llegar se lee como «no hay sesión», pero sin formulario:
  // pedir la cuenta cuando no se puede comprobar sería bloquear el entrenamiento.
  if (input.unavailable) return { kind: 'open', reason: 'unavailable' };
  // Ni un parpadeo del formulario sobre una sesión restaurada (S1).
  if (input.account === null) return { kind: 'waiting' };

  if (input.account.status === 'signed-in') return { kind: 'open', reason: 'signedIn' };
  if (input.account.status === 'signed-out') return { kind: 'ask' };
  // Configurado pero el servicio dice que no: gana la respuesta más prudente, entrar.
  return { kind: 'open', reason: 'unconfigured' };
}

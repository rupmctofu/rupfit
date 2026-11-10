/**
 * El nombre que viene de la cuenta (spec S1, L3): cómo se saca y cuándo se escribe.
 *
 * La regla es una sola frase —el nombre es el de la cuenta— y se parte en dos decisiones
 * puras para que la pantalla no tenga que pensar:
 *
 * 1. **De dónde sale** (`accountNameOf`). Si el proveedor trae un nombre en sus metadatos,
 *    ese es el nombre, tal cual. Si no, el correo: la parte anterior a la arroba, en
 *    minúsculas y sin puntos ni guiones (`roberto.puntow@…` → `robertopuntow`). Sin correo
 *    no hay nombre, y entonces no se deriva nada.
 * 2. **Cuándo se escribe** (`nameToWrite`). Solo cuando el perfil no tiene nombre. Un
 *    nombre que ya está escrito no se toca nunca: no hay forma de distinguir el que puso
 *    el dueño del que se derivó, y sobrescribir el suyo sería perder lo único que eligió.
 *    Si ya coincide con el derivado, tampoco hay nada que escribir.
 *
 * El campo se queda en el modelo y en la copia de seguridad: esto decide qué se escribe,
 * no qué se guarda (L3).
 */

/** Lo que la cuenta sabe de sí misma, sin objetos del proveedor (`AccountSession`). */
export interface AccountIdentity {
  readonly email: string | null;
  readonly metadataName: string | null;
}

/** El nombre de la cuenta, o `null` cuando no hay ni metadatos ni correo del que sacarlo. */
export function accountNameOf(account: AccountIdentity): string | null {
  const fromMetadata = account.metadataName?.trim() ?? '';
  if (fromMetadata !== '') return fromMetadata;

  const email = account.email?.trim() ?? '';
  const at = email.indexOf('@');
  // Sin arroba, o con la arroba delante, no hay parte local que valga.
  if (at <= 0) return null;

  const local = email.slice(0, at).toLowerCase().replace(/[.-]/g, '');
  return local === '' ? null : local;
}

/**
 * El nombre que hay que escribir en el perfil, o `null` cuando el guardado no se toca.
 * `derived` viene de `accountNameOf`; una cadena vacía no es un nombre.
 */
export function nameToWrite(stored: string | null, derived: string): string | null {
  if (derived.trim() === '') return null;
  // Sin nombre, o con el campo vacío: es el caso para el que existe esta regla.
  if (stored === null || stored.trim() === '') return derived.trim();
  // Con nombre —el del dueño o el mismo que se derivaría— no se escribe nada.
  return null;
}

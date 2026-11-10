/**
 * La entrada con cuenta (spec S1, L2): la tarjeta de la cuenta antes de Inicio.
 *
 * Es la misma tarjeta que Perfil enseña, con su misma copia y sus mismos campos
 * —`AccountForm`, extraído de `AccountGroup` para que no exista una segunda interfaz de
 * autenticación— y una sola cosa más: la salida secundaria `Seguir sin cuenta`.
 *
 * Tres reglas:
 *
 * 1. **Negarse está a un toque y no depende de nada.** No se lee el almacenamiento, no se
 *    espera a la red y no se comprueba la sesión para dejar pasar: la salida solo llama a
 *    `onSkip`, y desde ahí la app entra con lo local intacto (S4). Funciona sin conexión y
 *    con un almacén que no se puede leer.
 * 2. **Nada navega hasta que la sesión existe.** La pantalla no se cierra sola: el shell la
 *    retira cuando el proveedor contesta que hay sesión (`useAccountGate`), y entonces el
 *    nombre de la cuenta ya se puede escribir en el perfil.
 * 3. **La cuenta no bloquea el entrenamiento.** Es una entrada, no un muro: sin proyecto
 *    configurado no se dibuja nunca, y `Seguir sin cuenta` es un botón de texto, no un
 *    enlace escondido.
 */

import { Card, SectionLabel, TextButton } from '../../design-system';
import type { AuthPort } from '../../cloud/auth';
import { AccountForm, AccountIntro } from '../profile/AccountForm';
import './onboarding.css';

export interface AccountScreenProps {
  /** El servicio de cuentas, ya cargado por la puerta: esta pantalla no lo importa. */
  readonly auth: AuthPort;
  /** Lo que el servicio exige de una contraseña, para no repetir el número en la copia. */
  readonly passwordMinLength: number;
  /** «Seguir sin cuenta»: cierra la entrada por esta sesión y deja Inicio. */
  readonly onSkip: () => void;
}

export function AccountScreen({
  auth,
  passwordMinLength,
  onSkip,
}: AccountScreenProps): React.ReactElement {
  return (
    <div className="entry">
      <h1 className="ds-screen-title">Entra en tu cuenta</h1>

      <section className="entry__section">
        <SectionLabel>Cuenta</SectionLabel>
        <Card>
          <AccountIntro />
          <AccountForm auth={auth} passwordMinLength={passwordMinLength} />
        </Card>
      </section>

      {/* La salida, fuera de la tarjeta y sin caja: secundaria de verdad, pero presente
          sin desplazarse, porque negarse tiene que seguir siendo entrenar (S4). */}
      <TextButton align="center" onClick={onSkip}>
        Seguir sin cuenta
      </TextButton>
    </div>
  );
}

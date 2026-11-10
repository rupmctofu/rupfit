/**
 * La tarjeta de la cuenta, en las dos pantallas que la usan (spec S2, spec S8, spec S1).
 *
 * Perfil la enseña para gestionar la cuenta; la entrada la enseña para pedirla. La copia,
 * los campos y los estados viven aquí una sola vez: dos interfaces de autenticación con
 * textos distintos es exactamente lo que esta pieza evita, y por eso `AccountGroup` y
 * `AccountScreen` son dos marcos alrededor de las mismas piezas.
 *
 * El servicio entra como `AuthPort` y el mínimo de contraseña como número: nada de este
 * archivo importa `cloud/auth` en tiempo de ejecución, así que puede dibujarse en la
 * entrada —que es la primera pantalla— sin arrastrar `@supabase/supabase-js` al trozo
 * principal. La contraseña vive en el estado de este componente y en ningún otro sitio: se
 * entrega al servicio una vez por intento, se olvida cuando el formulario se desmonta y
 * nunca se escribe, se registra ni se vuelve a leer.
 */

import { useState, type ReactNode } from 'react';
import { ErrorBanner, TextButton } from '../../design-system';
import type { AuthPort, AuthResult } from '../../cloud/auth';
import { Note } from './fields';
import './profile.css';

export interface AccountIntroProps {
  readonly children?: ReactNode;
}

/** Las dos frases de la tarjeta: qué es una cuenta y qué se pierde sin ella (ninguna serie). */
export function AccountIntro({ children }: AccountIntroProps): React.ReactElement {
  return (
    <>
      {/* One line each: what the account buys, and that refusing costs nothing. The long
          version explained the platform to someone who only wants to train. */}
      <p className="ds-body">Tu historial, en la nube.</p>
      <p className="ds-caption">Sin cuenta se guarda en este teléfono y todo sigue funcionando.</p>
      {children}
    </>
  );
}

type Busy = 'sign-in' | 'sign-up' | 'reset' | null;

export interface AccountFormProps {
  /** El servicio de cuentas. El llamador lo inyecta: aquí no se importa ninguno. */
  readonly auth: AuthPort;
  /** `PASSWORD_MIN_LENGTH` del servicio, para que la pista diga el número de verdad. */
  readonly passwordMinLength: number;
}

/**
 * Los dos campos y las tres acciones de la cuenta. No navega ni cierra nada: cuando la
 * sesión existe, quien lo montó lo retira, y el mensaje de una cuenta creada sin sesión se
 * queda a la vista donde está.
 */
export function AccountForm({ auth, passwordMinLength }: AccountFormProps): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<AuthResult | null>(null);

  const run = (label: Busy, action: () => Promise<AuthResult>): void => {
    if (busy !== null) return;
    setBusy(label);
    setMessage(null);

    void (async () => {
      try {
        setMessage(await action());
      } catch {
        // The service promises a result and never a rejection; this is the belt.
        setMessage({
          kind: 'error',
          message: 'No se pudo completar la operación. Inténtalo otra vez.',
        });
      } finally {
        setBusy(null);
      }
    })();
  };

  const signIn = (): void => run('sign-in', () => auth.signIn(email, password));
  const signUp = (): void => run('sign-up', () => auth.signUp(email, password));
  const recover = (): void => run('reset', () => auth.requestPasswordReset(email));

  return (
    <form
      className="profile__account-form"
      onSubmit={(event) => {
        event.preventDefault();
        signIn();
      }}
    >
      <AccountField
        label="Correo"
        type="email"
        autoComplete="email"
        hint=""
        value={email}
        onChange={setEmail}
        disabled={busy !== null}
      />
      <AccountField
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        hint={`Al menos ${String(passwordMinLength)} caracteres.`}
        value={password}
        onChange={setPassword}
        disabled={busy !== null}
      />

      <div className="profile__account-actions">
        <TextButton onClick={signIn} disabled={busy !== null}>
          {busy === 'sign-in' ? 'Entrando…' : 'Entrar'}
        </TextButton>
        <TextButton onClick={signUp} disabled={busy !== null}>
          {busy === 'sign-up' ? 'Creando cuenta…' : 'Crear cuenta'}
        </TextButton>
      </div>

      <TextButton align="start" onClick={recover} disabled={busy !== null}>
        He olvidado la contraseña
      </TextButton>

      <AuthMessage message={message} />
    </form>
  );
}

/** La frase del servicio: un error como aviso, una respuesta como línea callada. */
export function AuthMessage({
  message,
}: {
  readonly message: AuthResult | null;
}): React.ReactElement | null {
  if (message === null) return null;
  if (message.kind === 'ok') {
    return <p className="ds-caption profile__hint profile__hint--success">{message.message}</p>;
  }
  if (message.kind === 'unconfigured') return <Note>{message.message}</Note>;
  return <ErrorBanner message={message.message} />;
}

interface AccountFieldProps {
  readonly label: string;
  readonly type: 'email' | 'password';
  readonly autoComplete: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
}

function accountHintId(label: string): string {
  return `profile-account-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-hint`;
}

/**
 * A labelled input with the profile field chrome, so the card adds no second input
 * style. `type="password"` is the reason it exists: `LiveField` is a text field.
 */
function AccountField({
  label,
  type,
  autoComplete,
  hint,
  value,
  onChange,
  disabled,
}: AccountFieldProps): React.ReactElement {
  const id = accountHintId(label);

  return (
    <label className="profile__field">
      <span className="ds-meta">{label}</span>
      <input
        className="profile__input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={id}
        disabled={disabled}
        {...(type === 'email' ? { inputMode: 'email' as const } : {})}
      />
      <span className="ds-caption profile__hint" id={id}>
        {hint}
      </span>
    </label>
  );
}

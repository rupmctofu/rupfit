/**
 * Cuenta — the account card of Perfil (spec S2, spec S8).
 *
 * Two faces, one section. Signed out, the card says what an account is for, offers the
 * four operations of S2 (create, enter, recover, and the honest line that training keeps
 * working without it) and never blocks anything: every local write stays on the device.
 * Signed in, it names the account in use, states the sync state, the last successful
 * sync and — when the engine reports one — the error with its `Reintentar`.
 *
 * The sync engine is written in parallel, so this file does not import it. It receives
 * an `AccountSyncView` (defined in `account-sync.ts`) as a prop and defaults to
 * `sin conexión` with zero pending changes, which is exactly what an app without an
 * engine, or without a project, should say. Same for authentication: the card talks to
 * an `AuthPort`, defaults to the real one, and a test or a demo can substitute it.
 *
 * The password lives in this component's state and nowhere else: it is handed to the
 * service once per attempt, cleared when the session appears, and never written,
 * logged or read back.
 */

import { useEffect, useState } from 'react';
import { Card, DataRow, ErrorBanner, SectionLabel, TextButton } from '../../design-system';
import { CLOUD_NOT_CONFIGURED } from '../../cloud/config';
import {
  PASSWORD_MIN_LENGTH,
  cloudAuth,
  type AuthPort,
  type AuthResult,
  type AuthState,
} from '../../cloud/auth';
import {
  NO_SYNC,
  canRetry,
  canSyncNow,
  lastSyncLine,
  migrationLine,
  syncStateWords,
  type AccountSyncView,
} from './account-sync';
import { Note } from './fields';

export interface AccountGroupProps {
  /** The sync state. Defaults to `sin conexión` with nothing pending. */
  readonly sync?: AccountSyncView | undefined;
  /** The auth service. Defaults to the real one, which is `unconfigured` with no project. */
  readonly auth?: AuthPort | undefined;
}

type Busy = 'sign-in' | 'sign-up' | 'reset' | 'sign-out' | null;

export function AccountGroup({ sync = NO_SYNC, auth = cloudAuth }: AccountGroupProps): React.ReactElement {
  // `null` until the service has spoken: a configured project resolves its stored
  // session asynchronously, and a signed-out form must never flash over it.
  const [account, setAccount] = useState<AuthState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<AuthResult | null>(null);

  useEffect(() => auth.subscribe(setAccount), [auth]);

  // The only place the password is dropped: the moment a session exists, the form that
  // would hold it is gone.
  useEffect(() => {
    if (account?.status === 'signed-in') setPassword('');
  }, [account]);

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
  const signOut = (): void => run('sign-out', () => auth.signOut());

  return (
    <section className="profile__section">
      <SectionLabel>Cuenta</SectionLabel>

      {account === null ? null : account.status === 'signed-in' ? (
        <SignedIn
          email={account.email}
          sync={sync}
          busy={busy}
          onSignOut={signOut}
          message={message}
        />
      ) : (
        <Card>
          <p className="ds-body">
            Una cuenta guarda tu historial en la nube, para que no dependa de este navegador ni
            de este teléfono.
          </p>
          <p className="ds-caption">
            Sin cuenta todo sigue funcionando: Rupfit guarda cada serie en este dispositivo y
            ninguna sincronización bloquea un entrenamiento.
          </p>

          {account.status === 'unconfigured' ? <Note>{CLOUD_NOT_CONFIGURED}</Note> : null}

          {account.status === 'signed-out' ? (
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
                hint="El mismo con el que crearás la cuenta."
                value={email}
                onChange={setEmail}
                disabled={busy !== null}
              />
              <AccountField
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
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
            </form>
          ) : null}

          <AuthMessage message={message} />
        </Card>
      )}
    </section>
  );
}

interface SignedInProps {
  readonly email: string | null;
  readonly sync: AccountSyncView;
  readonly busy: Busy;
  readonly onSignOut: () => void;
  readonly message: AuthResult | null;
}

/** Signed in: who, how far the sync got, and the two actions of S8. */
function SignedIn({ email, sync, busy, onSignOut, message }: SignedInProps): React.ReactElement {
  const words = syncStateWords(sync);
  // La migración cuenta lo que hizo una vez y se queda hasta cerrar sesión: es el único
  // sitio donde el dueño ve que su historial anterior llegó a la cuenta (S7).
  const moved = migrationLine(sync);

  return (
    <>
      <Card padding="list" label="Cuenta y sincronización">
        <DataRow title="Cuenta en uso" value={email ?? 'Sin correo visible'} />
        <DataRow
          title="Sincronización"
          status={{ word: words.word, tone: words.tone }}
          {...(words.detail === null ? {} : { subtitle: words.detail })}
        />
      </Card>

      <Note>{lastSyncLine(sync)}</Note>

      {moved === null ? null : <Note>{moved}</Note>}

      {canRetry(sync) ? (
        <ErrorBanner
          // El motivo va en la línea de estado (`syncStateWords`); aquí solo queda la
          // acción, para no decir dos veces la misma frase.
          message="La sincronización no ha terminado. Nada de lo que has guardado en este dispositivo se ha perdido."
          onRetry={sync.onRetry}
          retryLabel="Reintentar"
        />
      ) : null}

      <div className="profile__account-actions">
        <TextButton onClick={sync.onSync} disabled={!canSyncNow(sync)}>
          Sincronizar ahora
        </TextButton>
        <TextButton tone="danger" onClick={onSignOut} disabled={busy !== null}>
          {busy === 'sign-out' ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </TextButton>
      </div>

      <AuthMessage message={message} />
    </>
  );
}

/** The service's sentence: an error as a banner, an answer as a quiet line. */
function AuthMessage({ message }: { readonly message: AuthResult | null }): React.ReactElement | null {
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

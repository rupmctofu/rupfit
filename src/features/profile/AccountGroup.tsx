/**
 * Cuenta — the account card of Perfil (spec S2, spec S8).
 *
 * Two faces, one section. Signed out, the card says what an account is for, offers the
 * four operations of S2 (create, enter, recover, and the honest line that training keeps
 * working without it) and never blocks anything: every local write stays on the device.
 * Signed in, it names the account in use, states the sync state, the last successful
 * sync and — when the engine reports one — the error with its `Reintentar`.
 *
 * The form itself lives in `AccountForm.tsx`, because the entry screen asks for the same
 * account with the same words (`src/features/onboarding/AccountScreen.tsx`): this file is
 * the frame — the section, the two faces and the sign-out — around those pieces.
 *
 * The sync engine is written in parallel, so this file does not import it. It receives
 * an `AccountSyncView` (defined in `account-sync.ts`) as a prop and defaults to
 * `sin conexión` with zero pending changes, which is exactly what an app without an
 * engine, or without a project, should say. Same for authentication: the card talks to
 * an `AuthPort`, defaults to the real one, and a test or a demo can substitute it.
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
import { AccountForm, AccountIntro, AuthMessage } from './AccountForm';
import { Note } from './fields';

export interface AccountGroupProps {
  /** The sync state. Defaults to `sin conexión` with nothing pending. */
  readonly sync?: AccountSyncView | undefined;
  /** The auth service. Defaults to the real one, which is `unconfigured` with no project. */
  readonly auth?: AuthPort | undefined;
}

export function AccountGroup({ sync = NO_SYNC, auth = cloudAuth }: AccountGroupProps): React.ReactElement {
  // `null` until the service has spoken: a configured project resolves its stored
  // session asynchronously, and a signed-out form must never flash over it.
  const [account, setAccount] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<AuthResult | null>(null);

  useEffect(() => auth.subscribe(setAccount), [auth]);

  const signOut = (): void => {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    void (async () => {
      try {
        setMessage(await auth.signOut());
      } catch {
        // The service promises a result and never a rejection; this is the belt.
        setMessage({
          kind: 'error',
          message: 'No se pudo completar la operación. Inténtalo otra vez.',
        });
      } finally {
        setBusy(false);
      }
    })();
  };

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
          {account.status === 'unconfigured' ? (
            // Sin proyecto no hay nada que pedir ni que enviar: la frase de la
            // configuración y ninguna promesa de cuenta (ADR-0002).
            <AccountIntro>
              <Note>{CLOUD_NOT_CONFIGURED}</Note>
            </AccountIntro>
          ) : (
            <>
              <AccountIntro />
              <AccountForm auth={auth} passwordMinLength={PASSWORD_MIN_LENGTH} />
            </>
          )}
        </Card>
      )}
    </section>
  );
}

interface SignedInProps {
  readonly email: string | null;
  readonly sync: AccountSyncView;
  readonly busy: boolean;
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
        <TextButton tone="danger" onClick={onSignOut} disabled={busy}>
          {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </TextButton>
      </div>

      <AuthMessage message={message} />
    </>
  );
}

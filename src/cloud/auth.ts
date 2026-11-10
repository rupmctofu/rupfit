/**
 * Accounts, email and password only (spec S2): sign up, sign in, sign out, password
 * recovery, session persistence and session restore. No Google, no Apple.
 *
 * Two rules shape this module, and both are about what the screen is allowed to see:
 *
 * 1. **No Supabase object ever leaves here.** Every call resolves to an `AuthResult`
 *    whose `kind` is one of three words and whose `message` is a Spanish sentence the
 *    card can print. A raw error carries a request id, an English stack and sometimes a
 *    hint about which column failed; none of that belongs in front of the owner.
 * 2. **No project configured is a state, not a failure.** `cloudClient()` returns `null`
 *    on a build without `VITE_SUPABASE_URL`, and then every entry point answers
 *    `unconfigured` with `CLOUD_NOT_CONFIGURED` and nothing throws. Rupfit is local-first:
 *    an app with no account keeps working exactly as it did before this feature.
 *
 * Validation runs *before* the network and only after the configuration check, so a
 * missing `@` in airplane mode says something about the address instead of waiting for
 * a request that cannot succeed.
 *
 * Nothing here logs, echoes or stores a token or a password: the password lives in the
 * form's state and is handed to `supabase-js` exactly once per attempt.
 */

import type { Session } from '@supabase/supabase-js';
import { cloudClient } from './client';
import { CLOUD_NOT_CONFIGURED } from './config';

/** The shortest password the client accepts. Mirrors the project's own minimum. */
export const PASSWORD_MIN_LENGTH = 8;

export type AuthResultKind = 'ok' | 'error' | 'unconfigured';

/** The only shape the account card ever receives from this module. */
export interface AuthResult {
  readonly kind: AuthResultKind;
  /** A Spanish sentence the screen can print as it is. Never a provider error. */
  readonly message: string;
}

export type AuthStatus = 'unconfigured' | 'signed-out' | 'signed-in';

/** Who is signed in, in the only terms the interface needs. */
export interface AuthState {
  readonly status: AuthStatus;
  /** The account's address, or `null` when there is no session (or no address to show). */
  readonly email: string | null;
}

export type AuthListener = (state: AuthState) => void;

export const SIGNED_OUT: AuthState = { status: 'signed-out', email: null };
export const NO_CLOUD: AuthState = { status: 'unconfigured', email: null };

/**
 * The account as the entry gate and the profile need it: the state, the address, and the
 * name the provider carries, if it carries one.
 *
 * It is a separate shape from `AuthState` because `AuthState` is exact-equal in the
 * account card's tests and because `user_metadata` is a provider detail: it is read here,
 * once, and only a plain `string | null` crosses this boundary.
 */
export interface AccountSession {
  readonly status: AuthStatus;
  readonly email: string | null;
  /** `user_metadata.name`, trimmed, when the provider has one; otherwise `null`. */
  readonly metadataName: string | null;
}

export type AccountListener = (session: AccountSession) => void;

export const NO_ACCOUNT: AccountSession = { status: 'unconfigured', email: null, metadataName: null };
const SIGNED_OUT_ACCOUNT: AccountSession = { status: 'signed-out', email: null, metadataName: null };

// --------------------------------------------------------------- sentences

const NETWORK_MESSAGE =
  'No se pudo conectar con la nube. Tus datos siguen en este dispositivo; inténtalo cuando tengas conexión.';

const WAIT_MESSAGE = 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';

const GENERIC_MESSAGE = 'No se pudo completar la operación con la nube. Inténtalo otra vez.';

/**
 * Known provider codes, in the owner's words. Keys are Supabase's own codes; the
 * messages never repeat the provider's text, which is English and full of internals.
 */
const BY_CODE: Readonly<Record<string, string>> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed:
    'Todavía no has confirmado tu correo. Abre el enlace que te enviamos y vuelve a intentarlo.',
  user_already_exists:
    'Ya hay una cuenta con ese correo. Entra, o recupera la contraseña si no la recuerdas.',
  email_exists:
    'Ya hay una cuenta con ese correo. Entra, o recupera la contraseña si no la recuerdas.',
  weak_password: `Esa contraseña es demasiado débil. Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  over_email_send_rate_limit: WAIT_MESSAGE,
  over_request_rate_limit: WAIT_MESSAGE,
  otp_expired: 'El enlace ya no vale o ha caducado. Pide uno nuevo.',
  invalid_token: 'El enlace ya no vale o ha caducado. Pide uno nuevo.',
  session_not_found: 'La sesión ya no vale. Vuelve a entrar con tu correo y tu contraseña.',
  user_not_found: 'No hay ninguna cuenta con ese correo.',
  signup_disabled: 'Este proyecto no admite cuentas nuevas.',
};

/** Only these two fields are ever read off a provider error. */
export interface AuthFailureShape {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

/**
 * The sentence for a provider failure, chosen from its `code` and `status` alone: the
 * provider's `message` is never read, so it can never reach the screen.
 */
export function authFailureMessage(failure: AuthFailureShape): string {
  const known = BY_CODE[failure.code ?? ''];
  if (known !== undefined) return known;

  const status = failure.status;
  if (status === 429) return WAIT_MESSAGE;
  // `0` is how supabase-js reports a request that never left the device.
  if (status === undefined || status === 0) return NETWORK_MESSAGE;
  if (status >= 500) return 'La nube no responde en este momento. Inténtalo otra vez en un rato.';
  return GENERIC_MESSAGE;
}

/** The unconfigured answer, in one place so every call says the same sentence. */
export function unconfiguredResult(): AuthResult {
  return { kind: 'unconfigured', message: CLOUD_NOT_CONFIGURED };
}

function errorResult(failure: AuthFailureShape): AuthResult {
  return { kind: 'error', message: authFailureMessage(failure) };
}

function thrownResult(cause: unknown): AuthResult {
  return errorResult(failureOf(cause));
}

function failureOf(cause: unknown): AuthFailureShape {
  if (typeof cause !== 'object' || cause === null) return {};
  const record = cause as { readonly code?: unknown; readonly status?: unknown };
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  return status === undefined ? { code } : { code, status };
}

// -------------------------------------------------------------- validation

/** `null` when the address looks like one; otherwise the sentence to show. */
export function emailProblem(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed === '') return 'Escribe tu correo.';
  if (trimmed.length > 254) return 'Ese correo es demasiado largo. Revísalo.';
  // One `@`, something before it, a dot-separated domain after it, no spaces.
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(trimmed)) {
    return 'Ese correo no parece completo. Revísalo e inténtalo otra vez.';
  }
  return null;
}

/** `null` when the password is long enough; otherwise the sentence to show. */
export function passwordProblem(password: string): string | null {
  if (password === '') return 'Escribe tu contraseña.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return null;
}

// ------------------------------------------------------------------ state

/** The state a session resolves to. Exported because the card and a test both need it. */
export function authStateOf(session: Session | null): AuthState {
  if (session === null) return SIGNED_OUT;
  return { status: 'signed-in', email: session.user.email ?? null };
}

/**
 * The one field this module reads out of `user_metadata`, and only if it is a non-empty
 * string: the provider's metadata is untyped, and half of it is provider bookkeeping.
 */
function metadataNameOf(session: Session | null): string | null {
  const metadata: unknown = session?.user.user_metadata;
  if (typeof metadata !== 'object' || metadata === null) return null;
  const name = (metadata as { readonly name?: unknown }).name;
  if (typeof name !== 'string') return null;
  return name.trim() === '' ? null : name.trim();
}

/**
 * The session as the entry gate reads it: the same `authStateOf` decision plus the name
 * the provider knows, so the profile can take its own name from the account (spec S1).
 */
export function accountSessionOf(session: Session | null): AccountSession {
  if (session === null) return SIGNED_OUT_ACCOUNT;
  return {
    status: 'signed-in',
    email: session.user.email ?? null,
    metadataName: metadataNameOf(session),
  };
}

/** Whether this build has a project at all. */
export function accountConfigured(): boolean {
  return cloudClient() !== null;
}

/**
 * The auth state, as it changes. On a build with no project the listener is called
 * once, synchronously, with `unconfigured`, and the returned function does nothing.
 * With a project, Supabase emits `INITIAL_SESSION` first, so the card never renders a
 * signed-out form for an owner who is signed in.
 */
export function subscribeToAuth(listener: AuthListener): () => void {
  return subscribeToSessions(
    (session) => listener(authStateOf(session)),
    () => listener(NO_CLOUD),
  );
}

/**
 * The same subscription, carrying the name too: what the entry gate listens to. The first
 * callback is the stored session (`INITIAL_SESSION`), so a launch either restores an
 * account or knows it has none — and only then is a form allowed to appear.
 */
export function subscribeToAccount(listener: AccountListener): () => void {
  return subscribeToSessions(
    (session) => listener(accountSessionOf(session)),
    () => listener(NO_ACCOUNT),
  );
}

/** The one place the client is asked for a session; the two listeners only differ in shape. */
function subscribeToSessions(
  onSession: (session: Session | null) => void,
  onNoProject: () => void,
): () => void {
  const client = cloudClient();
  if (client === null) {
    onNoProject();
    return () => undefined;
  }

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    // Deliberately synchronous: Supabase queues events while an async callback runs.
    onSession(session);
  });

  return () => data.subscription.unsubscribe();
}

/**
 * Where the confirmation and recovery links should come back to. Absent in a Node test,
 * which is why the option is omitted instead of being sent as `undefined`.
 */
function appOrigin(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.location.origin;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- operations

/**
 * Creates an account. With "Confirm email" on — the project decides, the client handles
 * both — there is no session yet, so the sentence asks for the inbox instead of
 * pretending the owner is signed in.
 */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const client = cloudClient();
  if (client === null) return unconfiguredResult();

  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem !== null) return { kind: 'error', message: problem };

  const origin = appOrigin();
  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      ...(origin === null ? {} : { options: { emailRedirectTo: origin } }),
    });
    if (error !== null) return errorResult(error);
    return data.session === null
      ? { kind: 'ok', message: 'Cuenta creada. Revisa tu correo para confirmarla.' }
      : { kind: 'ok', message: 'Cuenta creada y sesión iniciada.' };
  } catch (cause) {
    return thrownResult(cause);
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = cloudClient();
  if (client === null) return unconfiguredResult();

  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem !== null) return { kind: 'error', message: problem };

  try {
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error !== null) return errorResult(error);
    return { kind: 'ok', message: 'Sesión iniciada.' };
  } catch (cause) {
    return thrownResult(cause);
  }
}

/**
 * Signs out on this device only. A global sign-out needs the network, and the one thing
 * an owner must always be able to do on a shared phone is leave the account.
 */
export async function signOut(): Promise<AuthResult> {
  const client = cloudClient();
  if (client === null) return unconfiguredResult();

  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error !== null) return errorResult(error);
    return { kind: 'ok', message: 'Has cerrado la sesión en este dispositivo.' };
  } catch (cause) {
    return thrownResult(cause);
  }
}

/**
 * Sends the recovery link. The answer is the same whether the address has an account
 * or not: telling a stranger which addresses exist is an enumeration oracle.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const client = cloudClient();
  if (client === null) return unconfiguredResult();

  const problem = emailProblem(email);
  if (problem !== null) return { kind: 'error', message: problem };

  const origin = appOrigin();
  try {
    const { error } = await client.auth.resetPasswordForEmail(
      email.trim(),
      origin === null ? {} : { redirectTo: origin },
    );
    if (error !== null) return errorResult(error);
    return {
      kind: 'ok',
      message: 'Si ese correo tiene cuenta, recibirás un enlace para cambiar la contraseña.',
    };
  } catch (cause) {
    return thrownResult(cause);
  }
}

/**
 * Reads back the session the previous launch stored (`persistSession` in `client.ts`).
 * The answer is not how the card learns who is signed in — the subscription is — but a
 * launch can ask once and know that a stored session still works before it draws.
 */
export async function restoreSession(): Promise<AuthResult> {
  const client = cloudClient();
  if (client === null) return unconfiguredResult();

  try {
    const { data, error } = await client.auth.getSession();
    if (error !== null) return errorResult(error);
    return data.session === null
      ? { kind: 'ok', message: 'No hay ninguna sesión guardada en este dispositivo.' }
      : { kind: 'ok', message: 'Sesión restaurada.' };
  } catch (cause) {
    return thrownResult(cause);
  }
}

/**
 * The surface the account card is written against. Injecting it keeps the card free of
 * `src/cloud` imports at its call site, and lets a test or a demo render every state.
 */
export interface AuthPort {
  readonly signUp: (email: string, password: string) => Promise<AuthResult>;
  readonly signIn: (email: string, password: string) => Promise<AuthResult>;
  readonly signOut: () => Promise<AuthResult>;
  readonly requestPasswordReset: (email: string) => Promise<AuthResult>;
  readonly restoreSession: () => Promise<AuthResult>;
  readonly subscribe: (listener: AuthListener) => () => void;
}

export const cloudAuth: AuthPort = {
  signUp,
  signIn,
  signOut,
  requestPasswordReset,
  restoreSession,
  subscribe: subscribeToAuth,
};

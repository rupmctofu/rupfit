/**
 * Starting a session for real: the port, the navigation, and the one rule that binds
 * them — **nothing navigates before the write resolves** (S3, architecture §2.2).
 *
 * `start.ts` decides; this file performs. Everything that can fail here is named:
 * the read that could not open the store, the create that was refused, and the reason
 * the app declined to write at all. Each returns a sentence and none of them navigates,
 * so the owner always stays on the screen that still says what happened.
 *
 * The React seam is the small hook at the bottom: it owns the in-flight flag so a double
 * tap cannot open two transactions, and it exposes the notice the screens render. It
 * deliberately holds no data reads — Inicio and Entrenar already have theirs.
 */

import { useCallback, useRef, useState } from 'react';
import type { StoragePort } from '../../storage';
import type { Clock } from './controller';
import {
  planStart,
  START_COPY,
  type IdFactory,
  type StartRefusal,
} from './start';

/** The sheet's own route. The session reads from the store; the id is not in the hash. */
export const SESSION_HASH = '#/sesion';

/**
 * How many stored sessions the start reads. The rotation needs the last closed one and
 * the engine wants each exercise's recent outcomes; twelve sessions is several weeks of
 * the owner's programme and one query.
 */
export const START_SESSION_WINDOW = 12;

export interface StartDeps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** Defaults to the hash, which is how the shell navigates. A demo passes its own. */
  readonly onNavigate?: ((href: string) => void) | undefined;
  /** Injected so a test can pin ids; the app uses `createIdFactory()`. */
  readonly newId?: IdFactory | undefined;
}

export type StartOutcome =
  /** The sheet can open: `created` says whether this call wrote the row. */
  | { readonly kind: 'opened'; readonly sessionId: string; readonly created: boolean }
  /** A state the owner has to change first (no plan, no profile, no exercises). */
  | { readonly kind: 'refused'; readonly refusal: StartRefusal; readonly message: string }
  /** A read or a write failed. Nothing was navigated and nothing was created. */
  | { readonly kind: 'failed'; readonly failure: 'read' | 'write'; readonly message: string };

let fallbackIds = 0;

/**
 * `crypto.randomUUID()` when the context is secure (GitHub Pages is), and a local
 * fallback otherwise. The id only has to be unique inside this one store, and the
 * fallback is never persisted as anything but a key — the same shape of compromise
 * `createProfileId` already makes in `src/features/profile/browser-edges.ts`.
 */
export function createIdFactory(): IdFactory {
  return () => {
    const webCrypto = globalThis.crypto as Crypto | undefined;
    if (webCrypto?.randomUUID !== undefined) return webCrypto.randomUUID();
    fallbackIds += 1;
    return `id-${fallbackIds.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };
}

function navigateToSession(): void {
  window.location.hash = SESSION_HASH;
}

/** Everything a start reads, in one place, so a failure is one failure. */
async function readInputs(storage: StoragePort) {
  await storage.open();
  const plan = await storage.plan.all();
  const sessions = await storage.sessions.recent(START_SESSION_WINDOW);
  const inProgress = await storage.sessions.inProgress();
  const library = await storage.exercises.all();
  const profile = await storage.profile.read();
  const phaseState = await storage.meta.readPhaseState();
  return { plan, sessions, inProgress, library, profile, phaseState };
}

/**
 * Reads what a start needs, in the order the screen's own boot reads it (a cache hit,
 * not a second load), decides, writes, and navigates **after** the write resolves.
 *
 * `planDayId` comes from Entrenar's list, where the owner names the day to train;
 * Inicio passes nothing and the rotation decides (`nextPlanDay`).
 */
export async function runStart(deps: StartDeps, planDayId: string | null = null): Promise<StartOutcome> {
  const navigate = deps.onNavigate ?? navigateToSession;
  const now = deps.clock.now();

  let inputs: Awaited<ReturnType<typeof readInputs>>;
  try {
    inputs = await readInputs(deps.storage);
  } catch {
    return { kind: 'failed', failure: 'read', message: START_COPY.readFailed };
  }

  let decision;
  try {
    decision = planStart({
      now,
      plan: inputs.plan,
      sessions: inputs.sessions,
      inProgress: inputs.inProgress,
      library: inputs.library,
      profile: inputs.profile,
      phaseState: inputs.phaseState,
      newId: deps.newId ?? createIdFactory(),
      planDayId,
    });
  } catch {
    // `planStart` is pure, but a malformed row must not escape as an unhandled rejection.
    return { kind: 'failed', failure: 'read', message: START_COPY.readFailed };
  }

  if (decision.kind === 'blocked') {
    return { kind: 'refused', refusal: decision.refusal, message: decision.message };
  }

  if (decision.kind === 'resume' || decision.kind === 'open') {
    navigate(SESSION_HASH);
    return { kind: 'opened', sessionId: decision.sessionId, created: false };
  }

  try {
    await deps.storage.sessions.create(decision.built.session);
  } catch {
    return { kind: 'failed', failure: 'write', message: START_COPY.createFailed };
  }

  navigate(SESSION_HASH);
  return { kind: 'opened', sessionId: decision.built.session.id, created: true };
}

/* ---------------------------------------------------------------- the React seam */

export interface StartNotice {
  readonly message: string;
  /** `danger` when a write failed; `warning` when a state has to change first. */
  readonly tone: 'warning' | 'danger';
  /** Whether repeating the same request can succeed (`Reintentar`). */
  readonly retry: boolean;
  /** The fix is in Perfil, not in a retry. */
  readonly profile: boolean;
}

export interface StartActionState {
  /** True while the write is in flight: the action is disabled and says so (S3). */
  readonly busy: boolean;
  readonly notice: StartNotice | null;
  start(planDayId?: string | null): void;
  dismiss(): void;
}

function noticeOf(outcome: StartOutcome): StartNotice | null {
  if (outcome.kind === 'opened') return null;
  if (outcome.kind === 'refused') {
    return {
      message: outcome.message,
      tone: 'warning',
      retry: false,
      profile: outcome.refusal === 'noProfile',
    };
  }
  return { message: outcome.message, tone: 'danger', retry: true, profile: false };
}

/**
 * The action Inicio and Entrenar share.
 *
 * Two flags, not one: `busy` is React state for the disabled action, and the ref is the
 * guard — two taps in the same tick both read the old state, and the ref is what stops
 * the second transaction.
 */
export function useStartSession(deps: StartDeps): StartActionState {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StartNotice | null>(null);
  const inFlight = useRef(false);
  const lastRequest = useRef<string | null>(null);

  const { storage, clock, onNavigate, newId } = deps;

  const start = useCallback(
    (planDayId: string | null = null) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastRequest.current = planDayId;
      setBusy(true);
      setNotice(null);
      void runStart({ storage, clock, onNavigate, newId }, planDayId).then(
        (outcome) => {
          inFlight.current = false;
          setBusy(false);
          setNotice(noticeOf(outcome));
        },
        () => {
          inFlight.current = false;
          setBusy(false);
          setNotice({ message: START_COPY.readFailed, tone: 'danger', retry: true, profile: false });
        },
      );
    },
    [storage, clock, onNavigate, newId],
  );

  const dismiss = useCallback(() => setNotice(null), []);

  return { busy, notice, start, dismiss };
}

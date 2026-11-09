/**
 * What the bar's central `Tu Entreno` control does, decided from what the shell already
 * knows (S1, S8).
 *
 * The shell draws one action inside the tab bar and it must behave like Inicio, not like a
 * second app: the same decision, the same sentences, the same single writer. So this file
 * decides *which* of the three paths the press takes, and `startSession.ts` still owns
 * every read and the only `sessions.create` in the tab shell:
 *
 * - **resume** — a session is open (I-9). The shell opens `#/sesion` and touches nothing:
 *   no read, no write, no reset. The sheet boots from the store and lands on the exercise
 *   that is due.
 * - **start** — the store can train. The shared start action runs, and `planStart` decides
 *   resume-vs-create from the same values Inicio's start reads.
 * - **refused** — a reason with a sentence, carried as a `StartNotice` so the bar says
 *   exactly what the screens say (`START_COPY`) instead of doing nothing visible.
 *
 * The values are the ones `useSetupGate` already holds: `setupOffer` answers both questions
 * this control needs (is there an open session, and can anything be started at all), so the
 * button adds no storage read path of its own and no polling.
 */

import type { SetupOffer } from '../features/onboarding/setup';
import { START_COPY } from '../features/session/start';
import type { StartNotice } from '../features/session/startSession';

export type TrainingAccess =
  /** A session is already open: open the sheet where it was left, writing nothing. */
  | { readonly kind: 'resume' }
  /** Run the shared start; it resumes an open session or creates the day the plan names. */
  | { readonly kind: 'start' }
  /** Nothing can be opened; `notice` is the sentence the owner reads. */
  | { readonly kind: 'refused'; readonly notice: StartNotice };

/**
 * The three refusals the gate can already prove, in the app's own words.
 *
 * `noProfile` keeps Inicio's escape hatch (`Ir a Perfil`) because a retry cannot write a
 * profile; the other two are states to fix in Ejercicios, so they carry no action there
 * either — the sentence already says where to go.
 */
const NO_PROFILE: StartNotice = {
  message: START_COPY.noProfile,
  tone: 'warning',
  retry: false,
  profile: true,
};

const NO_PLAN: StartNotice = {
  message: START_COPY.noPlan,
  tone: 'warning',
  retry: false,
  profile: false,
};

const READ_FAILED: StartNotice = {
  message: START_COPY.readFailed,
  tone: 'danger',
  retry: true,
  profile: false,
};

/**
 * The decision, pure and total: every `SetupOffer` maps to exactly one path.
 *
 * `loading` starts on purpose. The gate's snapshot is one frame of the tab shell and a
 * press during it must not be swallowed; `runStart` does its own read and answers with
 * `START_COPY.readFailed` if the store really cannot be opened. The session, summary and
 * gallery routes read the same shape because their gate is disabled — and their press is
 * the ordinary start, which is why the bar can stay visible under the summary.
 */
export function trainingAccess(offer: SetupOffer): TrainingAccess {
  if (offer.kind === 'setup') {
    return offer.reason === 'noProfile'
      ? { kind: 'refused', notice: NO_PROFILE }
      : { kind: 'refused', notice: NO_PLAN };
  }

  switch (offer.reason) {
    case 'sessionInProgress':
      return { kind: 'resume' };
    case 'failed':
      return { kind: 'refused', notice: READ_FAILED };
    case 'loading':
    case 'ready':
      return { kind: 'start' };
  }
}

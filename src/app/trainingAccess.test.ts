/**
 * The bar's central `Tu Entreno` control: resume, start, or refuse.
 *
 * The three branches are the whole behaviour of the button, and each one is a value the
 * shell already has (the setup gate's offer), so the bar cannot drift from Inicio: it
 * either opens the sheet the owner left open, runs the same start Inicio runs, or says one
 * of `START_COPY`'s sentences. No DOM, no storage: the press is a function of a value.
 */

import { describe, expect, it } from 'vitest';
import type { SetupOffer } from '../features/onboarding/setup';
import { START_COPY } from '../features/session/start';
import { trainingAccess } from './trainingAccess';

describe('the central Tu Entreno control', () => {
  it('resumes an open session without reading or writing anything', () => {
    const offer: SetupOffer = { kind: 'hidden', reason: 'sessionInProgress' };
    // The kind is the contract: `resume` opens `#/sesion` and writes nothing, which is
    // what keeps the progress of a session already started (I-9, S1).
    expect(trainingAccess(offer)).toEqual({ kind: 'resume' });
  });

  it('runs the shared start when the store can train', () => {
    expect(trainingAccess({ kind: 'hidden', reason: 'ready' })).toEqual({ kind: 'start' });
  });

  it('starts during the gate’s first frame instead of swallowing the press', () => {
    // The snapshot is one frame; a press during it must reach `runStart`, which reads for
    // itself and answers honestly. Two `loading` shapes exist because the gate is disabled
    // on the sheet routes and reports the same reason there.
    expect(trainingAccess({ kind: 'hidden', reason: 'loading' })).toEqual({ kind: 'start' });
  });

  it('refuses without a profile, in the app’s own words, with a way to fix it', () => {
    const access = trainingAccess({ kind: 'setup', reason: 'noProfile' });
    expect(access.kind).toBe('refused');
    if (access.kind !== 'refused') return;
    expect(access.notice).toEqual({
      message: START_COPY.noProfile,
      tone: 'warning',
      retry: false,
      profile: true,
    });
  });

  it('refuses without a plan, in the app’s own words', () => {
    const access = trainingAccess({ kind: 'setup', reason: 'noPlan' });
    expect(access.kind).toBe('refused');
    if (access.kind !== 'refused') return;
    expect(access.notice).toEqual({
      message: START_COPY.noPlan,
      tone: 'warning',
      retry: false,
      profile: false,
    });
  });

  it('refuses when the store could not be read, and offers the retry', () => {
    const access = trainingAccess({ kind: 'hidden', reason: 'failed' });
    expect(access.kind).toBe('refused');
    if (access.kind !== 'refused') return;
    expect(access.notice).toEqual({
      message: START_COPY.readFailed,
      tone: 'danger',
      retry: true,
      profile: false,
    });
    // Nothing is created on this branch: the message is the outcome, not a silent no-op.
    expect(access.notice.message).toBe(START_COPY.readFailed);
  });
});

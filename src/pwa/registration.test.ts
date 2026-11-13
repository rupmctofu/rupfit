/**
 * The registration gate and the worker's address — architecture §8.
 *
 * Both are pure values on purpose: "never in development" and "always at the deployed
 * base" are the two rules that, when they break, break silently (the app keeps working
 * and stops being offline-covered), so they are pinned here rather than on a phone.
 */

import { describe, expect, it } from 'vitest';
import { registrationDecision, serviceWorkerUrl } from './registration';

describe('registrationDecision', () => {
  it('registers in a production build that has a container', () => {
    expect(registrationDecision({ production: true, supported: true })).toEqual({ register: true });
  });

  it('never registers in development, even with a container', () => {
    expect(registrationDecision({ production: false, supported: true })).toEqual({
      register: false,
      reason: 'development',
    });
  });

  it('does not register in a browser without service workers', () => {
    expect(registrationDecision({ production: true, supported: false })).toEqual({
      register: false,
      reason: 'unsupported',
    });
  });

  it('says which half of the gate declined', () => {
    expect(registrationDecision({ production: false, supported: false })).toEqual({
      register: false,
      reason: 'development',
    });
  });
});

describe('serviceWorkerUrl', () => {
  it('sits at the deployed base', () => {
    expect(serviceWorkerUrl('/rupfit/')).toBe('/rupfit/sw.js');
    // The root deployment: Vercel serves the app from `/`, so the worker is `/sw.js` with
    // the default scope, which is the whole origin.
    expect(serviceWorkerUrl('/')).toBe('/sw.js');
  });

  it('follows the base instead of hard-coding the subpath', () => {
    expect(serviceWorkerUrl('/')).toBe('/sw.js');
    expect(serviceWorkerUrl('/otro-sitio/')).toBe('/otro-sitio/sw.js');
  });
});

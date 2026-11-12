/**
 * Public engine surface. Everything here is a pure function over plain data, usable
 * unchanged from a browser service worker or a Node test.
 */

export * from './rounding';
export * from './readaptation';
export * from './reasons';
export * from './confidence';
export * from './progression-engine';
// T1's week plan, re-exported for its first consumers (T4 in `features/home`).
export * from './week-plan';

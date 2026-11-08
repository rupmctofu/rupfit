/**
 * Rupfit core: pure domain types and the deterministic progression engine.
 *
 * No I/O, no storage, no DOM, no network, no clock of its own. Import from here
 * (or from `./core/domain` / `./core/engine`) in the app, the service worker or a test.
 */

export * from './core/domain';
export * from './core/engine';

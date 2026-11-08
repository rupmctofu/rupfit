/**
 * The owner of the service worker: when it registers, and that it is one instance.
 *
 * The container is a fake, not a browser: what matters here is that a development
 * build never asks to register, that a browser without service workers is not an
 * error, and that every caller gets the same watch (two would register twice and let
 * the root and Perfil disagree about a waiting update).
 */

import { describe, expect, it } from 'vitest';
import { appUpdateWatch, registerServiceWorker, type ServiceWorkerEnvironment } from './update';

interface FakeContainer {
  readonly container: ServiceWorkerContainer;
  readonly registered: string[];
}

function fakeContainer(): FakeContainer {
  const registered: string[] = [];
  const container = {
    controller: null,
    addEventListener: () => undefined,
    register: (url: string) => {
      registered.push(url);
      return Promise.resolve({
        waiting: null,
        installing: null,
        addEventListener: () => undefined,
        update: () => Promise.resolve(),
      });
    },
  };
  return { container: container as unknown as ServiceWorkerContainer, registered };
}

function environment(
  production: boolean,
  container: ServiceWorkerContainer | null,
): ServiceWorkerEnvironment {
  return { production, container, scriptUrl: '/rupfit/sw.js', reload: () => undefined };
}

describe('registerServiceWorker', () => {
  it('does not register in development', () => {
    const fake = fakeContainer();

    expect(registerServiceWorker(environment(false, fake.container))).toBe(false);
    expect(fake.registered).toEqual([]);
  });

  it('does not register when the browser has no service worker', () => {
    expect(registerServiceWorker(environment(true, null))).toBe(false);
  });

  it('registers the generated worker once per launch in a production build', async () => {
    const fake = fakeContainer();
    const env = environment(true, fake.container);

    expect(registerServiceWorker(env)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    // The watch is created on the first call, so this one joins it instead of
    // registering the same script a second time.
    registerServiceWorker(env);

    expect(fake.registered).toEqual(['/rupfit/sw.js']);
  });
});

describe('appUpdateWatch', () => {
  it('hands every caller the same watch', () => {
    expect(appUpdateWatch()).toBe(appUpdateWatch());
  });

  it('reports a waiting worker, never activates it on its own', () => {
    const watch = appUpdateWatch();

    // Nothing has been applied: `skipWaiting` only travels when a screen asks for it.
    expect(watch.runtime().waiting).toBe(false);
  });
});

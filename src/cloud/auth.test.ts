/**
 * The account service's pure edges: input validation, the build with no project, and
 * the sentences chosen from a provider failure.
 *
 * There is no live project in this repository (docs/cloud-sync.md §5), so the network
 * path cannot be exercised here; what is tested is everything that must hold without
 * one — including the one that matters most, that a missing configuration never throws
 * and never leaks a provider object.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_NOT_CONFIGURED } from './config';
import { resetCloudClient } from './client';
import {
  PASSWORD_MIN_LENGTH,
  SIGNED_OUT,
  authFailureMessage,
  authStateOf,
  emailProblem,
  passwordProblem,
  requestPasswordReset,
  restoreSession,
  signIn,
  signOut,
  signUp,
  subscribeToAuth,
  type AuthState,
} from './auth';

beforeEach(() => {
  // Pin the build to "no project": a developer's `.env.local` must not turn these
  // assertions into a network call.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  resetCloudClient();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetCloudClient();
});

describe('emailProblem', () => {
  it('accepts an address that could exist', () => {
    expect(emailProblem('ana@example.com')).toBeNull();
    expect(emailProblem('  ana@example.com  ')).toBeNull();
    expect(emailProblem('ana.maria+pesas@correo.example.es')).toBeNull();
  });

  it('asks for the address when the field is empty', () => {
    expect(emailProblem('')).toBe('Escribe tu correo.');
    expect(emailProblem('   ')).toBe('Escribe tu correo.');
  });

  it('names the typo instead of waiting for the network', () => {
    for (const broken of ['ana', 'ana@', 'ana@example', '@example.com', 'ana @example.com', 'a@b..c']) {
      expect(emailProblem(broken)).toContain('no parece completo');
    }
  });
});

describe('passwordProblem', () => {
  it('accepts a password at the minimum length', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('asks for a password when the field is empty', () => {
    expect(passwordProblem('')).toBe('Escribe tu contraseña.');
  });

  it('states the minimum length, the number of the rule and not a vague advice', () => {
    const problem = passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1));

    expect(problem).toContain(String(PASSWORD_MIN_LENGTH));
    expect(problem).toContain('caracteres');
  });
});

describe('a build with no project configured', () => {
  it('answers unconfigured, with the one sentence, from every entry point', async () => {
    const answers = await Promise.all([
      signUp('ana@example.com', 'unaClaveLarga'),
      signIn('ana@example.com', 'unaClaveLarga'),
      signOut(),
      requestPasswordReset('ana@example.com'),
      restoreSession(),
    ]);

    for (const answer of answers) {
      expect(answer).toEqual({ kind: 'unconfigured', message: CLOUD_NOT_CONFIGURED });
    }
  });

  it('answers the same for wrong input: there is nowhere to send it', async () => {
    await expect(signIn('nope', 'x')).resolves.toEqual({
      kind: 'unconfigured',
      message: CLOUD_NOT_CONFIGURED,
    });
  });

  it('never throws', async () => {
    await expect(signOut()).resolves.toBeDefined();
    await expect(requestPasswordReset('')).resolves.toBeDefined();
  });

  it('tells the subscriber once and returns a usable unsubscribe', () => {
    const seen: AuthState[] = [];

    const unsubscribe = subscribeToAuth((state) => seen.push(state));

    expect(seen).toEqual([{ status: 'unconfigured', email: null }]);
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('authStateOf', () => {
  it('maps no session to signed out', () => {
    expect(authStateOf(null)).toEqual(SIGNED_OUT);
  });

  it('carries the address of the account in use', () => {
    const session = { user: { email: 'ana@example.com' } } as unknown as Parameters<
      typeof authStateOf
    >[0];

    expect(authStateOf(session)).toEqual({ status: 'signed-in', email: 'ana@example.com' });
  });

  it('stays signed in when the provider gives no address to show', () => {
    const session = { user: { email: undefined } } as unknown as Parameters<typeof authStateOf>[0];

    expect(authStateOf(session)).toEqual({ status: 'signed-in', email: null });
  });
});

describe('authFailureMessage', () => {
  it('turns the codes the owner will actually hit into sentences', () => {
    expect(authFailureMessage({ code: 'invalid_credentials' })).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(authFailureMessage({ code: 'email_not_confirmed' })).toContain('confirmado tu correo');
    expect(authFailureMessage({ code: 'user_already_exists' })).toContain('Ya hay una cuenta');
    expect(authFailureMessage({ code: 'weak_password' })).toContain('al menos');
  });

  it('reads a request that never left the device as a connection problem', () => {
    expect(authFailureMessage({ status: 0 })).toContain('No se pudo conectar');
    expect(authFailureMessage({})).toContain('No se pudo conectar');
  });

  it('asks for a pause on a rate limit', () => {
    expect(authFailureMessage({ status: 429 })).toContain('Demasiados intentos');
    expect(authFailureMessage({ code: 'over_email_send_rate_limit' })).toContain('Demasiados');
  });

  it('falls back to a sentence of its own, never to the provider text', () => {
    const fallback = authFailureMessage({ code: 'something_the_client_never_saw', status: 400 });

    expect(fallback).toBe('No se pudo completar la operación con la nube. Inténtalo otra vez.');
  });
});

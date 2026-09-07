'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';
import { checkRateLimit, clearRateLimit, constantDelay } from '@/lib/rate-limit';

export type LoginState = { error?: string };

/**
 * Constant-time comparison that also hides the passcode's length.
 *
 * Both sides are hashed to fixed-width digests first: timingSafeEqual throws on
 * mismatched lengths, and comparing raw strings would leak length through which
 * branch is taken.
 */
function matches(candidate: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

function safeNextPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  // Only allow same-origin absolute paths, never "//evil.com" or "https://...".
  return /^\/(?!\/)/.test(path) ? path : '/admin';
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const passcode = String(formData.get('passcode') ?? '');
  const next = safeNextPath(formData.get('next'));

  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Please wait about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
    };
  }

  if (!matches(passcode, env.adminPasscode)) {
    await constantDelay();
    return { error: 'That passcode is not correct. Please check it and try again.' };
  }

  clearRateLimit(ip);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  redirect(next);
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}

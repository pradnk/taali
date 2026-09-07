import 'server-only';
import { cookies } from 'next/headers';

import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth';

/**
 * Whether the current request carries a valid admin session.
 *
 * The proxy already blocks /admin and /api/admin, so this is defence in depth:
 * a route that is moved or a matcher that is edited should not silently open an
 * endpoint that spends money on someone else's ElevenLabs credits.
 */
export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function unauthorized(): Response {
  return Response.json({ error: 'Not signed in.' }, { status: 401 });
}

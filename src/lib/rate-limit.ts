/**
 * Minimal fixed-window rate limiter for the login route.
 *
 * This is in-memory, so on serverless it only limits a single warm instance
 * rather than the deployment as a whole. It is therefore a speed bump, not a
 * wall. The real brute-force defence is `constantDelay()` below: every failed
 * attempt costs a fixed wall-clock second regardless of which instance serves
 * it, which caps the attack rate far more reliably than a counter that resets
 * on every cold start. Combined with a passphrase-length passcode that is
 * enough for a site of this size; move to Vercel KV if that ever changes.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimit(key: string): void {
  windows.delete(key);
}

/** Fixed cost applied to every failed login, successful or not. */
export function constantDelay(ms = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

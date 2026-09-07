/**
 * Environment access.
 *
 * Everything here is read lazily so that `next build` succeeds on a machine
 * that has no secrets configured (Vercel builds before env vars are attached,
 * and contributors should be able to typecheck without a database).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },

  get adminPasscode() {
    const passcode = required('ADMIN_PASSCODE');
    if (passcode.length < 12) {
      throw new Error(
        'ADMIN_PASSCODE must be at least 12 characters. A short passcode on a public URL is not worth much.',
      );
    }
    return passcode;
  },

  get sessionSecret() {
    return required('SESSION_SECRET');
  },

  get elevenLabsApiKey() {
    return required('ELEVENLABS_API_KEY');
  },
};

/**
 * Absolute origin of this deployment, used for certificate links and QR codes.
 * Prefers an explicitly configured domain so that links printed on a PDF keep
 * working after the underlying deployment URL rotates.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

/**
 * True for a Vercel hostname that belongs to a single deployment rather than to
 * the project.
 *
 * Vercel gives every build its own address -- `project-<hash>-team.vercel.app`
 * for a deployment, `project-git-<branch>-team.vercel.app` for a branch -- and
 * those are the addresses shown immediately after a deploy, so they are the
 * ones most likely to be pasted into NEXT_PUBLIC_SITE_URL by mistake. Only the
 * project's own alias survives the next deploy, which is what a QR code printed
 * on paper needs it to do.
 */
export function isDeploymentSpecificHost(host: string): boolean {
  if (!host.endsWith('.vercel.app')) return false;

  // The first segment is the project's own name and is never the giveaway, so
  // it is skipped: a project genuinely called "git-something" should not be
  // accused of being a branch deployment.
  const segments = host.slice(0, -'.vercel.app'.length).split('-').slice(1);

  // A branch deployment: project-git-<branch>-team.
  if (segments.includes('git')) return true;

  // A build: project-<hash>-team. The hash is exactly nine characters and mixes
  // letters with digits, which keeps an ordinary nine-letter word in a project
  // or team name from being mistaken for one.
  return segments.some(
    (segment) =>
      segment.length === 9 &&
      /^[a-z0-9]+$/.test(segment) &&
      /[a-z]/.test(segment) &&
      /[0-9]/.test(segment),
  );
}

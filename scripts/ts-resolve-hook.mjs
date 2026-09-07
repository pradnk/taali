import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Teaches Node the two things bundlers do for free, so verification scripts can
 * import the app's TypeScript sources directly rather than a second copy of the
 * logic that could drift from it:
 *
 *   - the "@/..." path alias from tsconfig.json
 *   - extensionless relative imports
 */

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src');
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '/index.ts'];

function firstExisting(basePath) {
  for (const extension of EXTENSIONS) {
    const candidate = basePath + extension;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(join(SRC, specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parent = fileURLToPath(new URL('.', context.parentURL));
    const resolved = firstExisting(join(parent, specifier));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  return nextResolve(specifier, context);
}

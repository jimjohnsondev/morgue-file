// Guards the one destructive step of the generator: clearing its output folder before a run.
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_FIXTURES_DIR = path.resolve(import.meta.dirname, '..', '..', 'fixtures');

/** Whether `child` is `parent` itself or a folder inside it. */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Whether the generator may delete and rewrite `<outputDir>/Reference`. Only folders under the
 * repo's fixtures folder or the temp folder qualify, so a mistyped argument can never wipe a real
 * Reference folder.
 */
export function canClearOutputDir(outputDir: string): boolean {
  const resolved = path.resolve(outputDir);
  return isInside(resolved, REPO_FIXTURES_DIR) || isInside(resolved, path.resolve(tmpdir()));
}

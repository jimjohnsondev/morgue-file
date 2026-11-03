// Copies the migration SQL files next to the built db code, since tsc only emits JavaScript.
import { cpSync } from 'node:fs';
import path from 'node:path';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const from = path.join(REPO_DIR, 'src', 'core', 'db', 'migrations');
const to = path.join(REPO_DIR, 'dist', 'core', 'db', 'migrations');

cpSync(from, to, { recursive: true });

// Finds and serves the hashed CSS and script files that Vite builds into dist/client.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The built files a page links to. Empty lists before the client has been built. */
export type PageAssets = {
  readonly styles: readonly string[];
  readonly scripts: readonly string[];
};

type ManifestEntry = { readonly file: string; readonly css?: readonly string[] };

const NO_ASSETS: PageAssets = { styles: [], scripts: [] };

/** Says whether a parsed manifest value has the shape of Vite's main entry. */
function isManifestEntry(value: unknown): value is ManifestEntry {
  return typeof value === 'object' && value !== null && 'file' in value;
}

/** Reads Vite's manifest and returns the URLs for the main entry's CSS and script. */
export async function loadPageAssets(clientDir: string): Promise<PageAssets> {
  const manifestPath = path.join(clientDir, '.vite', 'manifest.json');
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, 'utf8');
  } catch {
    // Unit tests and a fresh clone run without a client build; pages still render.
    return NO_ASSETS;
  }
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;
  const entry = manifest['main.ts'];
  if (!isManifestEntry(entry)) {
    return NO_ASSETS;
  }
  const styles = (entry.css ?? []).map((file) => `/${file}`);
  return { styles, scripts: [`/${entry.file}`] };
}

/** Matches the only file names the asset route will serve: Vite's hashed output. */
const ASSET_NAME = /^[\w-]+\.(css|js|svg)$/;

/** The content type of each kind of built file. */
const ASSET_TYPES = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
} as const;

/** Returns a built asset's bytes and type, or undefined for any other name. */
export async function readAsset(
  clientDir: string,
  fileName: string,
): Promise<{ body: Buffer; type: string } | undefined> {
  const match = ASSET_NAME.exec(fileName);
  if (match === null) {
    return undefined;
  }
  const type = ASSET_TYPES[match[1] as keyof typeof ASSET_TYPES];
  try {
    const body = await readFile(path.join(clientDir, 'assets', fileName));
    return { body, type };
  } catch {
    return undefined;
  }
}

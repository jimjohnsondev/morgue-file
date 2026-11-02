import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '#server/app.js';

import { makeTempInstall } from '../support/temp-install.js';

import type { InstallStateHolder } from '#server/install/install-state.js';
import type { TempInstall } from '../support/temp-install.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const TOKEN = 'test-token';
const OWN_ORIGIN = `http://127.0.0.1:${String(PORT)}`;
const OWN_HOST = `127.0.0.1:${String(PORT)}`;

let install: TempInstall;
let state: InstallStateHolder;
let app: FastifyInstance;

beforeEach(async () => {
  install = await makeTempInstall();
  state = { current: { kind: 'needs-setup' } };
  app = await buildApp({ config: { ...install.config, port: PORT }, install: state, token: TOKEN });
});

afterEach(async () => {
  await app.close();
  await install.remove();
});

/** Posts JSON the way the setup page does, with this app's origin and token. */
async function post(url: string, payload: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url,
    headers: { host: OWN_HOST, origin: OWN_ORIGIN, 'x-morgue-token': TOKEN },
    payload,
  });
}

/** Reads a JSON file the app wrote. */
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

describe('R30: the first-run page', () => {
  it('R30: opens instead of any page until setup has run', async () => {
    const response = await app.inject({ url: '/photos', headers: { host: OWN_HOST } });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/setup');

    const setup = await app.inject({ url: '/setup', headers: { host: OWN_HOST } });
    expect(setup.statusCode).toBe(200);
    expect(setup.body).toContain('Keep data with the app');
    expect(setup.body).toContain('Use a folder I choose');
  });

  it('R30: Check counts the files at the top level of the Reference folder', async () => {
    const response = await post('/api/setup/check-reference', { folder: install.referenceDir });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: `Found 2 files at the top level of ${install.referenceDir}.`,
    });
  });

  it("R30: rejects a Reference folder that doesn't exist", async () => {
    const missing = path.join(install.rootDir, 'No such folder');
    const check = await post('/api/setup/check-reference', { folder: missing });
    expect(check.statusCode).toBe(400);
    expect(check.json()).toMatchObject({ message: `There is no folder at ${missing}.` });

    const save = await post('/api/setup/save', { referenceDir: missing, dataChoice: 'with-app' });
    expect(save.statusCode).toBe(400);
    expect(state.current.kind).toBe('needs-setup');
  });

  it("R30: rejects a data folder it can't write to", async () => {
    // A path inside a file can never be created, on Windows or anywhere else.
    const blocker = path.join(install.rootDir, 'a file');
    await writeFile(blocker, 'in the way');
    const unwritable = path.join(blocker, 'data');

    const check = await post('/api/setup/check-data', { folder: unwritable });
    expect(check.statusCode).toBe(400);
    expect(check.json()).toMatchObject({ error: 'folder-unwritable' });

    const save = await post('/api/setup/save', {
      referenceDir: install.referenceDir,
      dataChoice: 'chosen',
      chosenDataDir: unwritable,
    });
    expect(save.statusCode).toBe(400);
    expect(state.current.kind).toBe('needs-setup');
  });

  it('R30: refuses a path that is not a full path', async () => {
    const response = await post('/api/setup/check-reference', { folder: 'Reference' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid-input' });
  });

  it('R30: Check on a data folder leaves nothing behind and spots an existing library', async () => {
    const fresh = path.join(install.rootDir, 'new data', 'MorgueFile');
    const freshCheck = await post('/api/setup/check-data', { folder: fresh });
    expect(freshCheck.statusCode).toBe(200);
    await expect(readFile(fresh)).rejects.toThrow();

    const existing = path.join(install.rootDir, 'old data');
    await mkdir(existing);
    await writeFile(path.join(existing, 'library.db'), '');
    const existingCheck = await post('/api/setup/check-data', { folder: existing });
    expect(existingCheck.json()).toEqual({
      message: `Found an existing library in ${existing}. Morgue File will use it.`,
    });
  });
});

describe('R30: saving the setup', () => {
  it('R30: Keep data with the app makes data\\ beside it, the Inbox, and opens Home', async () => {
    const save = await post('/api/setup/save', {
      referenceDir: install.referenceDir,
      dataChoice: 'with-app',
    });
    expect(save.statusCode).toBe(200);

    expect(await readJson(path.join(install.homeDir, 'morgue-file.json'))).toEqual({
      dataDir: 'data',
    });
    const dataDir = path.join(install.homeDir, 'data');
    expect(await readJson(path.join(dataDir, 'settings.json'))).toEqual({
      port: PORT,
      referenceDir: path.join('..', 'Reference tést'),
    });
    await expect(readFile(path.join(dataDir, 'morgue-file.lock'), 'utf8')).resolves.toContain(
      String(process.pid),
    );
    await expect(mkdir(path.join(install.referenceDir, 'Inbox'))).rejects.toThrow(/EEXIST/);

    const home = await app.inject({ url: '/', headers: { host: OWN_HOST } });
    expect(home.statusCode).toBe(200);
    const setupAgain = await app.inject({ url: '/setup', headers: { host: OWN_HOST } });
    expect(setupAgain.headers.location).toBe('/');
  });

  it('R30: Use a folder I choose saves that folder as an absolute path', async () => {
    const chosen = path.join(install.rootDir, 'Morgue data tést');
    const save = await post('/api/setup/save', {
      referenceDir: install.referenceDir,
      dataChoice: 'chosen',
      chosenDataDir: chosen,
    });
    expect(save.statusCode).toBe(200);
    expect(await readJson(path.join(install.homeDir, 'morgue-file.json'))).toEqual({
      dataDir: chosen,
    });
    expect(state.current).toMatchObject({ kind: 'ready', dataDir: chosen });
  });

  it('R30: a second Save is refused once the app is set up', async () => {
    const choices = { referenceDir: install.referenceDir, dataChoice: 'with-app' };
    expect((await post('/api/setup/save', choices)).statusCode).toBe(200);
    expect((await post('/api/setup/save', choices)).statusCode).toBe(409);
  });

  it('R30: a write without the launch token is refused', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save',
      headers: { host: OWN_HOST, origin: OWN_ORIGIN },
      payload: { referenceDir: install.referenceDir, dataChoice: 'with-app' },
    });
    expect(response.statusCode).toBe(403);
    expect(state.current.kind).toBe('needs-setup');
  });
});

describe('R29: a data folder that has gone missing', () => {
  it('R29: shows the setup page with a notice instead of starting over', async () => {
    const dataDir = path.join(install.rootDir, 'Unplugged drive', 'MorgueFile');
    state.current = { kind: 'data-missing', dataDir };
    const response = await app.inject({ url: '/setup', headers: { host: OWN_HOST } });
    expect(response.body).toContain(`can't find its data folder at ${dataDir}`);
  });
});

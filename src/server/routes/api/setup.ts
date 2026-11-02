// The setup page's Check buttons and Save (R30). Each answers with a message for the user.
import { Type } from '@sinclair/typebox';

import { inspectReferenceFolder } from '#core/archive/originals.js';
import { AppError } from '#core/errors.js';

import { checkDataFolder } from '../../install/data-folder.js';
import { claimDataFolder } from '../../install/lock-file.js';
import { completeSetup, requireFullPath } from '../../install/setup.js';

import type { InstallStateHolder } from '../../install/install-state.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** What the setup API needs from the app: where the home folder is, its port, and the state. */
export type SetupApiContext = {
  readonly homeDir: string;
  readonly port: number;
  readonly install: InstallStateHolder;
};

const FolderBody = Type.Object({ folder: Type.String({ maxLength: 4096 }) });

const SaveBody = Type.Object({
  referenceDir: Type.String({ maxLength: 4096 }),
  dataChoice: Type.Union([Type.Literal('with-app'), Type.Literal('chosen')]),
  chosenDataDir: Type.Optional(Type.String({ maxLength: 4096 })),
});

const MessageResponse = Type.Object({ message: Type.String() });

const formatCount = new Intl.NumberFormat('en-US');

/** Says how many files Check found, so the user can tell it's the folder they meant. */
function describeReferenceFolder(folder: string, fileCount: number): string {
  const files = fileCount === 1 ? 'file' : 'files';
  return `Found ${formatCount.format(fileCount)} ${files} at the top level of ${folder}.`;
}

/** Registers the two Check routes, which only read. */
function registerCheckRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const schema = { body: FolderBody, response: { 200: MessageResponse } };

  typed.post('/api/setup/check-reference', { schema }, async (request) => {
    const folder = requireFullPath(request.body.folder);
    const summary = await inspectReferenceFolder(folder);
    return { message: describeReferenceFolder(folder, summary.topLevelFileCount) };
  });

  typed.post('/api/setup/check-data', { schema }, async (request) => {
    const folder = requireFullPath(request.body.folder);
    const check = await checkDataFolder(folder);
    const message = check.hasLibrary
      ? `Found an existing library in ${folder}. Morgue File will use it.`
      : `Morgue File can keep its data in ${folder}.`;
    return { message };
  });
}

/** Registers Save, which writes the choice and switches the app over without a restart. */
function registerSaveRoute(app: FastifyInstance, context: SetupApiContext): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const schema = { body: SaveBody, response: { 200: MessageResponse } };

  typed.post('/api/setup/save', { schema }, async (request) => {
    if (context.install.current.kind === 'ready') {
      throw new AppError('already-set-up', 'Morgue File is already set up.');
    }
    const state = await completeSetup({
      homeDir: context.homeDir,
      port: context.port,
      choices: {
        referenceDir: request.body.referenceDir,
        dataChoice: request.body.dataChoice,
        chosenDataDir: request.body.chosenDataDir,
      },
    });
    if (state.kind === 'ready') {
      await claimDataFolder(state.dataDir, context.port);
    }
    context.install.current = state;
    return { message: 'Saved. Opening your archive.' };
  });
}

/** Registers the setup API: POST /api/setup/check-reference, check-data and save. */
export function registerSetupApi(app: FastifyInstance, context: SetupApiContext): void {
  registerCheckRoutes(app);
  registerSaveRoute(app, context);
}

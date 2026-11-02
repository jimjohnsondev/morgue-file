// The first-run setup page (R30): pick the Reference folder and where to keep the app's data.
import path from 'node:path';

import { findSuggestedReferenceFolder } from '#core/archive/originals.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { Panel } from '../../views/parts/panel.js';
import { renderDocument } from '../../views/render.js';

import type { InstallStateHolder } from '../../install/install-state.js';
import type { PageContext } from '../page-context.js';
import type { FastifyInstance } from 'fastify';

/** What the setup page shows besides the form: a missing data folder, and pre-filled paths. */
type SetupPageProps = {
  readonly context: PageContext;
  readonly missingDataDir: string | undefined;
  readonly suggestedReferenceDir: string;
  readonly suggestedDataDir: string;
};

/** The suggested folder for "Use a folder I choose": %LOCALAPPDATA%\MorgueFile on Windows. */
function suggestDataDir(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData === undefined ? '' : path.join(localAppData, 'MorgueFile');
}

/** Shown when morgue-file.json names a data folder that isn't there, e.g. an unplugged drive. */
function MissingDataNotice(props: { readonly dataDir: string }) {
  return (
    <p class="notice notice--problem">
      Morgue File can't find its data folder at {props.dataDir}. If it's on a drive that isn't
      plugged in, plug it in and reload this page. Or choose below where the data is now, or where
      to start a new library. Nothing is overwritten.
    </p>
  );
}

/** A path field with its Check button and the line where the check's answer appears. */
function FolderField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly check: 'reference' | 'data';
}) {
  return (
    <div class="folder-field">
      <label class="folder-field__label" for={props.id}>
        {props.label}
      </label>
      <input class="field" id={props.id} name={props.id} value={props.value} size={60} />
      <button class="button" type="button" data-setup-check={props.check}>
        Check
      </button>
      <p class="notice" data-setup-result={props.check} hidden />
    </div>
  );
}

/** The whole setup page. Check and Save run through src/client/setup-form.ts. */
function SetupPage(props: SetupPageProps) {
  return (
    <PageLayout
      title="Set up"
      currentPath="/setup"
      token={props.context.token}
      assets={props.context.assets}
    >
      <h1 class="page__title">Set up Morgue File</h1>
      {props.missingDataDir === undefined ? undefined : (
        <MissingDataNotice dataDir={props.missingDataDir} />
      )}
      <noscript>
        <p class="notice notice--problem">Setup needs JavaScript. Turn it on for this page.</p>
      </noscript>
      <form class="setup" data-setup-form>
        <Panel title="Reference folder">
          <p>
            The folder that holds your reference files. Morgue File reads it and never changes your
            files. Files you drop onto the app are saved in an Inbox folder inside it.
          </p>
          <FolderField
            id="referenceDir"
            label="Folder"
            value={props.suggestedReferenceDir}
            check="reference"
          />
        </Panel>
        <Panel title="Where to keep data">
          <p>The app's data: its database, thumbnails, backups and settings.</p>
          <label class="choice">
            <input type="radio" name="dataChoice" value="with-app" checked />
            Keep data with the app: in a data folder beside it, so the app and its data move, update
            and uninstall together.
          </label>
          <label class="choice">
            <input type="radio" name="dataChoice" value="chosen" />
            Use a folder I choose, for example on a bigger or backed-up drive.
          </label>
          <FolderField
            id="chosenDataDir"
            label="Data folder"
            value={props.suggestedDataDir}
            check="data"
          />
        </Panel>
        <p class="setup__actions">
          <button class="button button--primary" type="submit">
            Save
          </button>
        </p>
        <p class="notice" data-setup-result="save" hidden />
      </form>
    </PageLayout>
  );
}

/** Registers GET /setup. Once setup has run, it sends the browser to Home instead. */
export function registerSetupPage(
  app: FastifyInstance,
  context: PageContext,
  install: InstallStateHolder,
): void {
  app.get('/setup', async (_request, reply) => {
    const state = install.current;
    if (state.kind === 'ready') {
      return reply.redirect('/', 303);
    }
    const html = renderDocument(
      <SetupPage
        context={context}
        missingDataDir={state.kind === 'data-missing' ? state.dataDir : undefined}
        suggestedReferenceDir={findSuggestedReferenceFolder() ?? ''}
        suggestedDataDir={suggestDataDir()}
      />,
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });
}

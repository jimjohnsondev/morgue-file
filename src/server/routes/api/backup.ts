// Settings' Backup and restore panel (R26): GET /settings/backup downloads the library as a zip,
// and POST /api/backup/restore takes such a zip back, sent by client/restore-backup.ts.
import { makeBackupZip } from '#core/backup/backup-zip.js';
import { AppError } from '#core/errors.js';

import { restoreLibrary } from '../../library-restore.js';
import { requireLibrary } from '../require-library.js';

import type { InstallStateHolder } from '../../install/install-state.js';
import type { LibraryRuntime } from '../../library-runtime.js';
import type { FastifyInstance } from 'fastify';

/** What the backup routes need from the app. */
export type BackupApiContext = {
  readonly install: InstallStateHolder;
  readonly library: LibraryRuntime | undefined;
  readonly appVersion: string;
};

/** The body type a backup is sent back as; its bytes are streamed to disk, never buffered. */
const BACKUP_CONTENT_TYPE = 'application/zip';

/** Registers GET /settings/backup: one click saves the whole library as a zip. */
function registerBackupDownload(app: FastifyInstance, context: BackupApiContext): void {
  app.get('/settings/backup', async (_request, reply) => {
    const { db } = requireLibrary(context.library);
    const install = context.install.current;
    if (install.kind !== 'ready') {
      throw new AppError('library-unavailable', 'The library is not open yet.');
    }
    const backup = makeBackupZip(db, {
      dataDir: install.dataDir,
      appVersion: context.appVersion,
      now: new Date(),
    });
    // The copy is deleted once the response is over, whether it was sent in full or not.
    reply.raw.once('close', () => void backup.discard());
    return reply
      .type(BACKUP_CONTENT_TYPE)
      .header('content-disposition', `attachment; filename="${backup.fileName}"`)
      .header('cache-control', 'no-store')
      .send(backup.content);
  });
}

/**
 * Registers POST /api/backup/restore. The zip is the whole body, so a large library streams
 * straight to disk without a multipart parser. One restore runs at a time.
 */
function registerRestore(app: FastifyInstance, context: BackupApiContext): void {
  let isRestoring = false;
  void app.register((scope, _options, done) => {
    // Leaves the body unread for the route to stream; only this scope accepts it.
    scope.addContentTypeParser(BACKUP_CONTENT_TYPE, (_request, _payload, parsed) => {
      parsed(null, undefined);
    });
    scope.post('/api/backup/restore', async (request, reply) => {
      if (isRestoring) {
        request.raw.resume();
        throw new AppError('restore-running', 'A restore is already running. Wait for it to end.');
      }
      isRestoring = true;
      try {
        await restoreLibrary({ ...context, log: request.log }, request.raw);
      } catch (error) {
        // A refusal can come before the body is read; read it to the end so the browser gets
        // the reason rather than a dropped connection.
        request.raw.resume();
        throw error;
      } finally {
        isRestoring = false;
      }
      return reply.code(204).send();
    });
    done();
  });
}

/** Registers the backup download and the restore. Both refuse while no library is open. */
export function registerBackupApi(app: FastifyInstance, context: BackupApiContext): void {
  registerBackupDownload(app, context);
  registerRestore(app, context);
}

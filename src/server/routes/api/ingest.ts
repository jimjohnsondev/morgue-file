// POST /api/ingest and /api/ingest/url: files dropped or pasted onto a page, and web addresses
// dragged from a browser with no file, saved to the Inbox (R2). client/ingest-upload.ts sends
// them with the launch token; each answers with the new item's id for the "Saved to Unsorted"
// notice (E6), or with the item a file the archive already has is a copy of (R8).
import { Type } from '@sinclair/typebox';

import { ingestFile, ingestUrl } from '#core/ingest/ingest.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** A file's name and source address ride in the query, so its bytes can be the whole body. */
const FileQuerystring = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 1024 }),
  source: Type.Optional(Type.String({ maxLength: 8192 })),
});

const UrlBody = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 8192 }),
});

/** What both routes answer: the item the file became, and whether it was already kept (R8). */
const IngestReply = Type.Object({ itemId: Type.Integer(), isDuplicate: Type.Boolean() });

/** The body type uploads are sent as; its bytes are streamed to the Inbox, never buffered. */
const UPLOAD_CONTENT_TYPE = 'application/octet-stream';

/**
 * Registers the ingest routes. One file is sent per request, as its raw bytes, so a large video
 * streams straight to disk without a multipart parser. They refuse while no library is open.
 */
export function registerIngestApi(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  void app.register((scope, _options, done) => {
    // Leaves the body unread for the route to stream; only routes in this scope accept it.
    scope.addContentTypeParser(UPLOAD_CONTENT_TYPE, (_request, _payload, parsed) => {
      parsed(null, undefined);
    });
    const typed = scope.withTypeProvider<TypeBoxTypeProvider>();
    typed.post(
      '/api/ingest',
      { schema: { querystring: FileQuerystring, response: { 201: IngestReply } } },
      async (request, reply) => {
        try {
          const result = await ingestFile(requireLibrary(library), {
            fileName: request.query.name,
            content: request.raw,
            sourceUrl: request.query.source,
          });
          return await reply.code(201).send(result);
        } catch (error) {
          // A refusal comes before the body is read; read it to the end so the browser gets the
          // reason rather than a dropped connection.
          request.raw.resume();
          throw error;
        }
      },
    );
    typed.post(
      '/api/ingest/url',
      { schema: { body: UrlBody, response: { 201: IngestReply } } },
      async (request, reply) => {
        const result = await ingestUrl(requireLibrary(library), request.body.url);
        return reply.code(201).send(result);
      },
    );
    done();
  });
}

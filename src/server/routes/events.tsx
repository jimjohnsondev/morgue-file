// GET /events: streams the frame's live notices to open pages over server-sent events, so the
// indexing bar counts up (E5) and the offline band comes and goes (E3) without a reload. Each
// event carries the HTML of both slots; client/live-status.ts swaps it in.
import { StatusBands, StatusFooterLines } from '../views/parts/status-notices.js';
import { renderFragment } from '../views/render.js';

import { readLiveStatus } from './page-status.js';

import type { LibraryRuntime } from '../library-runtime.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';

/** How often the notices are read; an event goes out only when they changed. */
const POLL_MS = 500;

/** A comment line now and then keeps idle connections from being dropped. */
const KEEP_ALIVE_MS = 15_000;

/** The HTML of the two slots, as one event's data. */
function renderSlots(library: LibraryRuntime | undefined): string {
  const status = readLiveStatus(library);
  return JSON.stringify({
    bands: renderFragment(<StatusBands status={status} />),
    footer: renderFragment(<StatusFooterLines status={status} />),
  });
}

/** Starts an event stream on a hijacked reply, with the security headers set on the request. */
function openStream(reply: FastifyReply): ServerResponse {
  void reply.hijack();
  const stream = reply.raw;
  // Hijacked replies skip Fastify's sending, so the headers are copied across by hand.
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) {
      stream.setHeader(name, value);
    }
  }
  stream.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
  });
  return stream;
}

/** Sends the slots now and whenever they change, until the page closes the connection. */
function streamStatus(
  request: FastifyRequest,
  stream: ServerResponse,
  library: LibraryRuntime | undefined,
): void {
  let lastSent = '';
  function sendIfChanged(): void {
    try {
      const slots = renderSlots(library);
      if (slots !== lastSent) {
        lastSent = slots;
        stream.write(`event: status\ndata: ${slots}\n\n`);
      }
    } catch (error) {
      // A closed or busy database skips one update; the next poll tries again.
      request.log.warn({ err: error }, 'Could not read the live notices');
    }
  }
  sendIfChanged();
  const polling = setInterval(sendIfChanged, POLL_MS);
  const keepingAlive = setInterval(() => stream.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
  stream.on('close', () => {
    clearInterval(polling);
    clearInterval(keepingAlive);
  });
}

/**
 * Registers /events. Streams stay open until the page goes; buildApp's forceCloseConnections
 * ends any still open when the server closes.
 */
export function registerEventsRoute(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  app.get('/events', (request, reply) => {
    streamStatus(request, openStream(reply), library);
  });
}

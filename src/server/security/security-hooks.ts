// Registers the request checks that keep the archive reachable only from this PC's own pages.
import { randomBytes } from 'node:crypto';

import { AppError } from '#core/errors.js';

import { CONTENT_SECURITY_POLICY } from './csp.js';
import { isAllowedHost } from './host-check.js';
import { isCrossSite, isTrustedWrite, TOKEN_HEADER } from './origin-check.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Makes the random token pages must send back on every write. New on every launch. */
export function createLaunchToken(): string {
  return randomBytes(32).toString('hex');
}

/** Returns a single header value, treating a repeated header as missing. */
function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/** Throws if the request breaks any of the localhost rules in docs/ARCHITECTURE.md (Security). */
function checkRequest(request: FastifyRequest, port: number, token: string): void {
  if (!isAllowedHost(readHeader(request, 'host'), port)) {
    throw new AppError('forbidden-host', 'Unexpected Host header.');
  }
  if (isCrossSite(readHeader(request, 'sec-fetch-site'))) {
    throw new AppError('forbidden-cross-site', 'Requests from other sites are refused.');
  }
  if (SAFE_METHODS.has(request.method)) {
    return;
  }
  const headers = {
    fetchSite: readHeader(request, 'sec-fetch-site'),
    origin: readHeader(request, 'origin'),
    token: readHeader(request, TOKEN_HEADER),
  };
  if (!isTrustedWrite(headers, port, token)) {
    throw new AppError('missing-token', 'Writes need this app’s origin and token.');
  }
}

/** Adds the host, origin and token checks and the security headers to every request. */
export function registerSecurityHooks(app: FastifyInstance, port: number, token: string): void {
  // A callback-style hook: Fastify turns a throw in checkRequest into the mapped error response.
  // Headers are set first so refusals carry them too.
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('content-security-policy', CONTENT_SECURITY_POLICY);
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('referrer-policy', 'no-referrer');
    checkRequest(request, port, token);
    done();
  });
}

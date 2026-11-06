// Fetches the file behind a dragged web address for ingest, with the limits in
// docs/ARCHITECTURE.md (Security): http and https only, public addresses only, image and video
// types only, and at most 200 MB.
import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import { AppError } from '#core/errors.js';

import { nameFetchedFile } from './file-names.js';
import { isPublicAddress } from './public-address.js';

import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';

/** The largest file a URL drop fetches. */
const MAX_FETCH_BYTES = 200 * 1024 * 1024;

/** Redirects followed before giving up, as browsers stop at about 20; a file needs few. */
const MAX_REDIRECTS = 5;

/** How long the connection may sit idle, waiting for the server, before the fetch fails. */
const IDLE_TIMEOUT_MS = 30_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** A fetched file, named for the Inbox, with its bytes still arriving. */
export type FetchedFile = {
  readonly fileName: string;
  readonly content: Readable;
};

/** Limits a fetch; tests loosen them to fetch from a server on this PC. */
export type FetchLimits = {
  readonly isAllowedAddress?: (address: string) => boolean;
  readonly maxBytes?: number;
};

/** The settings one fetch runs with, every limit filled in. */
type FetchRun = {
  readonly isAllowedAddress: (address: string) => boolean;
  readonly maxBytes: number;
};

/** The refusal for an address that isn't on the public internet. */
function refuseAddress(url: URL): AppError {
  return new AppError(
    'fetch-refused',
    `Morgue File only fetches files from the internet, not from ${url.hostname}.`,
  );
}

/**
 * Resolves host names as usual, but fails the connection if any address found isn't allowed. The
 * check happens on the address actually connected to, so a name that resolves to this PC is
 * refused even when it looked public (DNS rebinding).
 */
function checkedLookup(url: URL, run: FetchRun): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, options, (error, address, family) => {
      const addresses = typeof address === 'string' ? [address] : address.map((one) => one.address);
      if (error === null && !addresses.every(run.isAllowedAddress)) {
        callback(refuseAddress(url), address, family);
        return;
      }
      callback(error, address, family);
    });
  };
}

/** Refuses anything but an http or https address, and an IP address that isn't allowed. */
function requireFetchable(url: URL, run: FetchRun): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('fetch-refused', `Morgue File only fetches http and https addresses.`);
  }
  // A host written as an IP address is connected to without a lookup, so check it here.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0 && !run.isAllowedAddress(host)) {
    throw refuseAddress(url);
  }
}

/** Sends one GET and waits for the response's status and headers. */
async function requestOnce(url: URL, run: FetchRun): Promise<IncomingMessage> {
  requireFetchable(url, run);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(url, { lookup: checkedLookup(url, run) }, resolve);
    request.setTimeout(IDLE_TIMEOUT_MS, () => {
      request.destroy(new AppError('fetch-failed', `${url.hostname} stopped answering.`));
    });
    request.on('error', (error) => {
      reject(
        error instanceof AppError
          ? error
          : new AppError('fetch-failed', `Morgue File couldn't fetch ${url.href}.`),
      );
    });
  });
}

/** The response that has the file, and the address it came from after any redirects. */
type FinalResponse = { readonly response: IncomingMessage; readonly url: URL };

/** Follows redirects, each checked like the first address, to the response that has the file. */
async function requestFollowingRedirects(url: URL, run: FetchRun): Promise<FinalResponse> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await requestOnce(current, run);
    const location = response.headers.location;
    if (!REDIRECT_STATUSES.has(response.statusCode ?? 0) || location === undefined) {
      return { response, url: current };
    }
    response.resume();
    current = new URL(location, current);
  }
  throw new AppError('fetch-failed', `${url.hostname} redirected too many times.`);
}

/**
 * Passes the body through, failing once it grows past the limit. A generator reads nothing until
 * the save starts reading it, so a failure can't arrive before anyone is listening for it.
 */
async function* limitSize(url: URL, body: IncomingMessage, maxBytes: number) {
  let received = 0;
  for await (const chunk of body) {
    const bytes = chunk as Buffer;
    received += bytes.length;
    if (received > maxBytes) {
      throw new AppError('too-large', `${url.href} is larger than Morgue File fetches.`);
    }
    yield bytes;
  }
}

/**
 * Fetches the file at a dragged web address (R2), checked against the Security limits, and names
 * it for the Inbox. The bytes are returned as a stream for the caller to save; it fails part way
 * if the file turns out larger than the limit.
 */
export async function fetchUrlFile(url: URL, limits: FetchLimits = {}): Promise<FetchedFile> {
  const run: FetchRun = {
    isAllowedAddress: limits.isAllowedAddress ?? isPublicAddress,
    maxBytes: limits.maxBytes ?? MAX_FETCH_BYTES,
  };
  // The file is named from where it was found: a short link names nothing.
  const { response, url: foundAt } = await requestFollowingRedirects(url, run);
  try {
    if (response.statusCode !== 200) {
      throw new AppError(
        'fetch-failed',
        `${url.hostname} answered ${String(response.statusCode)} for ${url.href}.`,
      );
    }
    const fileName = nameFetchedFile(foundAt, response.headers['content-type']);
    if (Number(response.headers['content-length'] ?? 0) > run.maxBytes) {
      throw new AppError('too-large', `${url.href} is larger than Morgue File fetches.`);
    }
    return { fileName, content: Readable.from(limitSize(url, response, run.maxBytes)) };
  } catch (error) {
    response.destroy();
    throw error;
  }
}

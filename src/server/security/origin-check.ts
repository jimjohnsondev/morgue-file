// Checks that a request came from one of Morgue File's own pages, not a foreign website.

/** The header every state-changing request must carry, holding the per-launch token. */
export const TOKEN_HEADER = 'x-morgue-token';

/** The request headers the origin checks read. */
export type OriginHeaders = {
  readonly fetchSite: string | undefined;
  readonly origin: string | undefined;
  readonly token: string | undefined;
};

/**
 * Says whether the browser marked the request as coming from another site.
 * Requests without the header (curl, the launcher's health check) are allowed,
 * because only a browser page can be tricked into sending one.
 */
export function isCrossSite(fetchSite: string | undefined): boolean {
  return fetchSite === 'cross-site';
}

/** Says whether an Origin header names this server. */
export function isOwnOrigin(origin: string | undefined, port: number): boolean {
  return (
    origin === `http://127.0.0.1:${String(port)}` || origin === `http://localhost:${String(port)}`
  );
}

/** Says whether a state-changing request carries the right origin and token. */
export function isTrustedWrite(
  headers: OriginHeaders,
  port: number,
  expectedToken: string,
): boolean {
  return isOwnOrigin(headers.origin, port) && headers.token === expectedToken;
}

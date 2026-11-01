// Refuses requests whose Host header isn't this server's own loopback address.
// This blocks DNS rebinding, where a website points its own name at 127.0.0.1.

/** Returns the Host header values the server answers to on the given port. */
export function allowedHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${String(port)}`, `localhost:${String(port)}`]);
}

/** Says whether a request's Host header names this server. A missing header is refused. */
export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) {
    return false;
  }
  return allowedHosts(port).has(hostHeader.toLowerCase());
}

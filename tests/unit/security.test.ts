import { describe, expect, it } from 'vitest';

import { isAllowedHost } from '#server/security/host-check.js';
import { isCrossSite, isOwnOrigin, isTrustedWrite } from '#server/security/origin-check.js';

const PORT = 47613;

describe('R27: host check', () => {
  it('accepts 127.0.0.1 and localhost on our port', () => {
    expect(isAllowedHost('127.0.0.1:47613', PORT)).toBe(true);
    expect(isAllowedHost('localhost:47613', PORT)).toBe(true);
    expect(isAllowedHost('LOCALHOST:47613', PORT)).toBe(true);
  });

  it('refuses other hosts, other ports and a missing header', () => {
    expect(isAllowedHost('evil.example:47613', PORT)).toBe(false);
    expect(isAllowedHost('127.0.0.1:8080', PORT)).toBe(false);
    expect(isAllowedHost('127.0.0.1', PORT)).toBe(false);
    expect(isAllowedHost('192.168.1.20:47613', PORT)).toBe(false);
    expect(isAllowedHost(undefined, PORT)).toBe(false);
  });
});

describe('R27: origin and token checks', () => {
  it('treats only cross-site fetches as foreign', () => {
    expect(isCrossSite('cross-site')).toBe(true);
    expect(isCrossSite('same-origin')).toBe(false);
    expect(isCrossSite('none')).toBe(false);
    expect(isCrossSite(undefined)).toBe(false);
  });

  it('recognizes only our own origins', () => {
    expect(isOwnOrigin('http://127.0.0.1:47613', PORT)).toBe(true);
    expect(isOwnOrigin('http://localhost:47613', PORT)).toBe(true);
    expect(isOwnOrigin('https://127.0.0.1:47613', PORT)).toBe(false);
    expect(isOwnOrigin('http://evil.example', PORT)).toBe(false);
    expect(isOwnOrigin(undefined, PORT)).toBe(false);
  });

  it('needs both the origin and the token for a write', () => {
    const own = 'http://127.0.0.1:47613';
    expect(
      isTrustedWrite({ fetchSite: 'same-origin', origin: own, token: 'abc' }, PORT, 'abc'),
    ).toBe(true);
    expect(
      isTrustedWrite({ fetchSite: 'same-origin', origin: own, token: 'xyz' }, PORT, 'abc'),
    ).toBe(false);
    expect(
      isTrustedWrite({ fetchSite: undefined, origin: undefined, token: 'abc' }, PORT, 'abc'),
    ).toBe(false);
  });
});

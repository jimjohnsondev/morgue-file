// Decides which addresses a URL drop may fetch from: public ones only, so a page can't use the
// app to reach this PC or the local network (docs/ARCHITECTURE.md, Security).
import { BlockList, isIP } from 'node:net';

/** Address ranges that are never fetched: this PC, private networks, link-local and the like. */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, shared by an ISP's customers
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** An IPv4 address written inside IPv6 (`::ffff:127.0.0.1`), which reaches the IPv4 host. */
const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/**
 * Says whether an IP address is on the public internet: not loopback, private, link-local,
 * multicast or reserved. Anything that isn't an IP address at all counts as not public.
 */
export function isPublicAddress(address: string): boolean {
  const mapped = MAPPED_IPV4.exec(address)?.[1];
  if (mapped !== undefined) {
    return isPublicAddress(mapped);
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

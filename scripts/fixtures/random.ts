// Seeded randomness for the fixture generator. Every file gets its own generator, seeded from its
// path, so the output never depends on the order or concurrency the files are written in.

/** A source of numbers in [0, 1), like Math.random but repeatable. */
export type Random = () => number;

/** Hashes text to a 32-bit unsigned number (FNV-1a), used as a seed. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Makes a mulberry32 generator: small, fast and the same on every platform. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one entry of a non-empty list. */
export function pickFrom<T>(random: Random, choices: readonly T[]): T {
  const choice = choices[Math.floor(random() * choices.length)];
  if (choice === undefined) {
    throw new Error('pickFrom needs at least one choice.');
  }
  return choice;
}

/** Returns a whole number from min to max, both included. */
export function wholeNumberBetween(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

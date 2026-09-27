/**
 * Deterministic hashing of names into seeded trait streams.
 *
 * Everything a hiblob is comes from these numbers. The same normalized name
 * always produces the same stream — on every platform and every JS engine —
 * because all arithmetic here is 32-bit integer math (`Math.imul`, `>>> 0`),
 * which behaves identically wherever the package runs.
 */

/**
 * 32-bit FNV-1a over the UTF-8 bytes of `s`.
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(s);
  for (let i = 0; i < bytes.length; i++) {
    h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 PRNG with a fixed, portable sequence.
 */
class Mulberry32 {
  private state: number;
  constructor(state: number) {
    this.state = state >>> 0;
  }

  /** The next value in `[0, 1)`. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * The stream value for `key` derived from `seed`, in `[0, 1)`.
 *
 * Streams are addressed by string key rather than drawn from one sequential
 * state, so adding a new trait later never disturbs the values existing
 * traits read, and any single trait can be pinned without moving the others.
 */
export function stream(seed: string, key: string): number {
  return new Mulberry32((fnv1a32(seed) ^ fnv1a32(key)) >>> 0).next();
}

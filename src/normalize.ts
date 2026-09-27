/**
 * The pure hash/geometry/color core of hiblob — see `hash.ts` and
 * `options.ts` for the entry numbers.
 */

/**
 * Normalizes a name the way the generator hashes it: Unicode NFC
 * (canonical composition, so `'e'` + U+0301 and `'é'` are one name), trim,
 * and lowercase.
 */
export function normalizeSeed(name: string): string {
  return name.trim().toLowerCase().normalize('NFC');
}

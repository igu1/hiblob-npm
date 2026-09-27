import type { Backdrop, Expression, HiblobOptions } from '../src/index.js';
import { expressions } from '../src/index.js';

export const sampleNames = [
  '',
  'a',
  'ada',
  'ada@example.com',
  'Ada Lovelace',
  '  spaced  ',
  'GRACE',
  'hopper-42',
  'zoë',
  'Zoë',
  '命',
  'λ-man',
  '🦊',
  'octo-cat',
  'marianna.delores.ellington@sub.example.co.uk',
  'x'.repeat(200),
];

const expressionById = new Map(expressions.map((e) => [e.id, e]));

/** Rebuilds a `HiblobOptions` object from the golden JSON form (written by
 * `tools/generate_goldens.dart`). */
export function optionsFromDb(
  db: Record<string, unknown> | null | undefined,
): HiblobOptions {
  const o: HiblobOptions = {};
  if (!db) return o;
  if (db['background'] != null) {
    o.background = db['background'] as Backdrop;
  }
  if (db['hue'] != null) o.hue = db['hue'] as number;
  if (db['tone'] != null) o.tone = db['tone'] as number;
  if (db['palette'] != null) {
    o.palette = db['palette'] as NonNullable<HiblobOptions['palette']>;
  }
  if (db['accessories'] != null) {
    o.accessories = db['accessories'] as NonNullable<
      HiblobOptions['accessories']
    >;
  }
  if (db['mouth'] != null) o.mouth = db['mouth'] as boolean;
  if (db['traits'] != null) {
    o.traits = db['traits'] as NonNullable<HiblobOptions['traits']>;
  }
  if (db['normalize'] != null) o.normalize = db['normalize'] as boolean;
  if (db['contrast'] != null) o.contrast = db['contrast'] as boolean;
  if (db['expression'] != null) {
    o.expression = expressionById.get(db['expression'] as string) as Expression;
  }
  return o;
}

/** The center of a band table entry, so a pinned trait lands mid-band. */
export function bandCenter(band: readonly [number, number]): number {
  const mid = (band[0] + band[1]) / 2;
  return Math.min(mid, 0.999999);
}

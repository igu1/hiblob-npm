/**
 * Facial expressions: poses drawn on top of the hiblob body.
 *
 * An `Expression` shifts the eyes (`eyeOffsetDx`, `eyeOffsetDy`) and may tint
 * the body toward a color. The eye *shapes* each expression draws are chosen
 * by the layout when it builds the eye marks.
 */

/**
 * One expression pose.
 *
 * Equality is by `id`: two expressions with the same id are the same pose.
 */
export class Expression {
  readonly id: string;
  /** Fixed eye shift in view-box units (negative x looks left, negative y
   * looks up). */
  readonly eyeOffsetDx: number;
  readonly eyeOffsetDy: number;
  /** Body tint as ARGB, blended by `tintAlpha`. `null` means none (the tint
   * comes from `tintFor`). */
  readonly tint: number | null;
  readonly tintAlpha: number;

  constructor(
    id: string,
    eyeOffsetDx = 0,
    eyeOffsetDy = 0,
    tint: number | null = null,
    tintAlpha = 0,
  ) {
    this.id = id;
    this.eyeOffsetDx = eyeOffsetDx;
    this.eyeOffsetDy = eyeOffsetDy;
    this.tint = tint;
    this.tintAlpha = tintAlpha;
  }

  equals(other: Expression): boolean {
    return other.id === this.id;
  }

  toString(): string {
    return `Expression(${this.id})`;
  }
}

/** The neutral face. */
export const idle = new Expression('idle');
/** Closed smiling eyes. */
export const happy = new Expression('happy');
/** Eyes curved upward at the outer edge. */
export const sad = new Expression('sad');
/** Slanted, lowered brows with a faint hot tint. */
export const mad = new Expression('mad', 0, 0, null, 0.1);
/** Wide round eyes. */
export const surprised = new Expression('surprised');
/** One eye open, one closed. */
export const wink = new Expression('wink');
/** Half-closed, drooping eyes. */
export const sleepy = new Expression('sleepy');
/** One eye open, one raised in a smirk. */
export const smug = new Expression('smug');
/** One eye open, one small and doubtful. */
export const unsure = new Expression('unsure');
/** Widest eyes with a faint cold tint. */
export const scared = new Expression('scared', 0, 0, null, 0.1);
/** Heart-shaped eyes with a warm tint. */
export const love = new Expression('love', 0, 0, null, 0.22);
/** Small closed eyes drawn inward, blushing. */
export const shy = new Expression('shy', 0, 0, null, 0.15);
/** Squinting lines with a queasy tint. */
export const sick = new Expression('sick', 0, 0, null, 0.18);
/** Eyes glancing up and to the left, one squinting. */
export const thinking = new Expression('thinking', -1.2, -1.6);
/** A wide open smile. */
export const grin = new Expression('grin');
/** A downturned mouth that droops at the corners. */
export const frown = new Expression('frown');

/** Every built-in expression, in roster order. */
export const expressions: readonly Expression[] = [
  idle,
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking,
  grin,
  frown,
];

/** The tint color used by expressions that carry one, as ARGB (0 for none). */
export function tintFor(expression: Expression): number {
  switch (expression.id) {
    case 'love':
      return 0xfff06292; // warm pink
    case 'shy':
      return 0xfff8bbd0; // blush
    case 'sick':
      return 0xff9ccc65; // queasy green
    case 'scared':
      return 0xff90caf9; // cold blue
    case 'mad':
      return 0xffef5350; // hot red
    default:
      return 0x00000000;
  }
}

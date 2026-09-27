import { describe, expect, it } from 'vitest';

import {
  AccessoryKeys,
  GeometryPath,
  resolve,
  shapeBands,
  svgOf,
} from '../src/index.js';
import type { Pt } from '../src/index.js';
import { bandCenter } from './util.js';

/**
 * Flattens a filled `GeometryPath` into a polygon by sampling every curve,
 * so point-in-silhouette checks can run without a renderer.
 */
function flatten(path: GeometryPath, perCurve = 24): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = { x: NaN, y: NaN };
  for (const c of path.commands) {
    switch (c.kind) {
      case 'move':
        cur = { x: c.x, y: c.y };
        pts.push(cur);
        break;
      case 'line':
        cur = { x: c.x, y: c.y };
        pts.push(cur);
        break;
      case 'quad': {
        const start = cur;
        for (let i = 1; i <= perCurve; i++) {
          const t = i / perCurve;
          const u = 1 - t;
          cur = {
            x: u * u * start.x + 2 * u * t * c.cx + t * t * c.x,
            y: u * u * start.y + 2 * u * t * c.cy + t * t * c.y,
          };
          pts.push(cur);
        }
        break;
      }
      case 'cubic': {
        const start = cur;
        for (let i = 1; i <= perCurve; i++) {
          const t = i / perCurve;
          const u = 1 - t;
          cur = {
            x:
              u * u * u * start.x +
              3 * u * u * t * c.c1x +
              3 * u * t * t * c.c2x +
              t * t * t * c.x,
            y:
              u * u * u * start.y +
              3 * u * u * t * c.c1y +
              3 * u * t * t * c.c2y +
              t * t * t * c.y,
          };
          pts.push(cur);
        }
        break;
      }
      case 'close':
        break;
    }
  }
  return pts;
}

/** Even-odd ray-cast point-in-polygon. */
function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

describe('the fitted brow cap covers the upper body (Dart accessories_test)', () => {
  it('cap covers the upper outline of every silhouette and body size', () => {
    for (const [bandName, band] of Object.entries(shapeBands)) {
      for (const radius of [0.0, 0.5, 1.0]) {
        const figure = resolve('cap-fit', {
          traits: {
            shape: bandCenter(band),
            'body.r': radius,
          },
          accessories: {
            [AccessoryKeys.fringe]: 1,
            [AccessoryKeys.glasses]: 0,
            [AccessoryKeys.blush]: 0,
            [AccessoryKeys.antennae]: 0,
          },
        });
        const body = figure.body.map((p) => flatten(p));
        const cap = figure.accessories
          .filter((a) => !a.path.stroke)
          .map((a) => ({
            path: flatten(a.path),
            clip: flatten(a.clip as GeometryPath),
          }));
        const edge = 52 - (26 + radius * 8) * 0.38;
        const containsIn = (
          polys: { path: Pt[]; clip?: Pt[] }[],
          pt: Pt,
        ): boolean =>
          polys.some(
            (p) =>
              pointInPolygon(pt, p.path) &&
              (p.clip === undefined || pointInPolygon(pt, p.clip)),
          );
        for (let y = 0.5; y < edge - 0.5; y += 1) {
          for (let x = 0.5; x < 100; x += 1) {
            const point = { x, y };
            const inBody = containsIn(
              body.map((path) => ({ path })),
              point,
            );
            const inCap = containsIn(cap, point);
            expect(inCap, `${bandName}, radius ${radius}, at ${x},${y}`).toBe(
              inBody,
            );
          }
        }
        expect(svgOf(figure)).toContain(
          'clipPathUnits="userSpaceOnUse"',
        );
      }
    }
  });
});

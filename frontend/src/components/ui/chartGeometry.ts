// Pure coordinate math for TrainingChart. No React, so it unit-tests in node.

import type { EpochMetric } from "@/lib/nlp/api";

export interface Point {
  x: number;
  y: number;
}

export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotBox {
  width: number;
  height: number;
  /** Space reserved around the plot area for axis labels. Defaults to none. */
  inset?: Inset;
  /** Value range mapped onto the plot area's bottom..top. */
  yDomain: [number, number];
}

const NO_INSET: Inset = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Maps a series (one value per epoch, in order) to SVG coordinates inside
 * `box`. Points are spread evenly across the plot width, so x increases
 * strictly with the index. Never produces NaN:
 * - a single point sits in the horizontal middle;
 * - a degenerate domain (min == max) puts every point at mid-height;
 * - values outside the domain are clamped to its edge;
 * - a non-finite value (NaN/Infinity) sits at mid-height.
 */
export function toSvgPoints(values: readonly number[], box: PlotBox): Point[] {
  const { width, height, yDomain } = box;
  const inset = box.inset ?? NO_INSET;
  const left = inset.left;
  const top = inset.top;
  const innerW = Math.max(0, width - inset.left - inset.right);
  const innerH = Math.max(0, height - inset.top - inset.bottom);
  const [min, max] = yDomain;
  const span = max - min;
  const n = values.length;

  return values.map((value, i) => {
    const x = n === 1 ? left + innerW / 2 : left + (i * innerW) / (n - 1);
    let t = 0.5;
    if (span > 0 && Number.isFinite(value)) {
      t = Math.min(1, Math.max(0, (value - min) / span));
    }
    return { x, y: top + innerH * (1 - t) };
  });
}

/** Formats points for an SVG `<polyline points>` attribute. */
export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Shared y-domain for the two loss series: 0 up to the largest loss seen.
 * Falls back to [0, 1] when there is nothing positive to scale to.
 */
export function lossDomain(history: readonly EpochMetric[]): [number, number] {
  let max = 0;
  for (const m of history) {
    if (Number.isFinite(m.intent_loss)) max = Math.max(max, m.intent_loss);
    if (Number.isFinite(m.amount_loss)) max = Math.max(max, m.amount_loss);
  }
  return [0, max > 0 ? max : 1];
}

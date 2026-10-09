import { describe, expect, it } from "vitest";
import { lossDomain, pointsAttr, toSvgPoints, type PlotBox } from "@/components/ui/chartGeometry";
import type { EpochMetric } from "@/lib/nlp/api";

const box: PlotBox = {
  width: 600,
  height: 180,
  inset: { top: 10, right: 12, bottom: 20, left: 40 },
  yDomain: [0, 2],
};

function insideViewBox(x: number, y: number) {
  return x >= 0 && x <= box.width && y >= 0 && y <= box.height;
}

describe("toSvgPoints", () => {
  it("returns no points for an empty series", () => {
    expect(toSvgPoints([], box)).toEqual([]);
    expect(pointsAttr([])).toBe("");
  });

  it("places a single point at finite coordinates inside the viewBox", () => {
    const [p] = toSvgPoints([1.63], box);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(insideViewBox(p.x, p.y)).toBe(true);
    // Centred horizontally within the plot area.
    expect(p.x).toBeCloseTo(40 + (600 - 40 - 12) / 2, 10);
  });

  it("spans the plot area with strictly increasing x", () => {
    const pts = toSvgPoints([1.6, 1.2, 0.8, 0.3, 0.01], box);
    expect(pts[0].x).toBe(40);
    expect(pts[pts.length - 1].x).toBe(600 - 12);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
  });

  it("maps the domain onto bottom..top of the plot area", () => {
    const [low, high] = toSvgPoints([0, 2], box);
    expect(low.y).toBe(180 - 20);
    expect(high.y).toBe(10);
  });

  it("keeps every point inside the viewBox, clamping out-of-domain values", () => {
    const values = [-5, 0, 0.5, 2, 99, Number.NaN, Number.POSITIVE_INFINITY];
    for (const p of toSvgPoints(values, box)) {
      expect(Number.isNaN(p.x) || Number.isNaN(p.y)).toBe(false);
      expect(insideViewBox(p.x, p.y)).toBe(true);
    }
  });

  it("does not produce NaN for a degenerate domain", () => {
    const pts = toSvgPoints([0, 0, 0], { width: 100, height: 50, yDomain: [0, 0] });
    for (const p of pts) expect(p.y).toBe(25);
  });

  it("formats points for a polyline", () => {
    expect(pointsAttr([{ x: 1, y: 2.345 }, { x: 3.5, y: 4 }])).toBe("1.00,2.35 3.50,4.00");
  });
});

describe("lossDomain", () => {
  const m = (intent_loss: number, amount_loss: number): EpochMetric => ({
    epoch: 1,
    intent_loss,
    amount_loss,
    intent_accuracy: 0.2,
  });

  it("falls back to [0, 1] with no data", () => {
    expect(lossDomain([])).toEqual([0, 1]);
    expect(lossDomain([m(0, 0)])).toEqual([0, 1]);
  });

  it("spans 0 to the largest of both losses", () => {
    expect(lossDomain([m(1.63, 1.23), m(0.5, 1.9)])).toEqual([0, 1.9]);
  });
});

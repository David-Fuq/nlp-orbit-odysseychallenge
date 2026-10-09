"use client";

// Live training curves. Presentational only: `history` arrives as a prop (one
// entry per epoch, appended as `metrics` messages stream in) and the parent
// owns the WebSocket. Two panels rather than one dual-axis chart: the losses
// share a linear axis (PR-04 trains the amount head on amount_cm / 100, so
// both sit in the same order of magnitude); accuracy gets a fixed 0-1 axis.

import type { EpochMetric } from "@/lib/nlp/api";
import { lossDomain, pointsAttr, toSvgPoints, type Inset } from "./chartGeometry";

const WIDTH = 800;
const HEIGHT = 200;
const INSET: Inset = { top: 10, right: 12, bottom: 24, left: 52 };

// Tailwind 600 steps; validated as a distinguishable, CVD-safe set with >= 3:1
// contrast against both the white and slate-900 panel surfaces.
const SERIES = {
  intent_loss: { label: "Intent loss", stroke: "stroke-sky-600", fill: "fill-sky-600", swatch: "bg-sky-600" },
  amount_loss: { label: "Amount loss", stroke: "stroke-amber-600", fill: "fill-amber-600", swatch: "bg-amber-600" },
  intent_accuracy: { label: "Intent accuracy", stroke: "stroke-emerald-600", fill: "fill-emerald-600", swatch: "bg-emerald-600" },
} as const;

type SeriesKey = keyof typeof SERIES;

// Display-only formatting; the client types keep the raw floats.
function fmt(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  return Math.abs(value) < 0.001 ? value.toExponential(2) : value.toPrecision(3);
}

function Panel({
  title,
  history,
  keys,
  yDomain,
}: {
  title: string;
  history: readonly EpochMetric[];
  keys: readonly SeriesKey[];
  yDomain: [number, number];
}) {
  const box = { width: WIDTH, height: HEIGHT, inset: INSET, yDomain };
  const plotBottom = HEIGHT - INSET.bottom;
  const plotRight = WIDTH - INSET.right;
  const midY = INSET.top + (plotBottom - INSET.top) / 2;
  const latest = history[history.length - 1];
  const first = history[0];

  const summary = latest
    ? `${title}, epochs ${first.epoch} to ${latest.epoch}. Latest: ` +
      keys.map((k) => `${SERIES[k].label} ${fmt(latest[k])}`).join(", ")
    : `${title}: no epochs yet`;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          {keys.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`inline-block h-0.5 w-4 rounded ${SERIES[k].swatch}`} />
              {SERIES[k].label}
              {latest ? (
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {fmt(latest[k])}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={summary}
      >
        {/* Recessive grid: top, middle, baseline. */}
        {[INSET.top, midY, plotBottom].map((y) => (
          <line
            key={y}
            x1={INSET.left}
            x2={plotRight}
            y1={y}
            y2={y}
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={1}
          />
        ))}
        <g className="fill-slate-500 text-[12px] dark:fill-slate-400">
          <text x={INSET.left - 6} y={INSET.top} dominantBaseline="middle" textAnchor="end">
            {fmt(yDomain[1])}
          </text>
          <text x={INSET.left - 6} y={plotBottom} dominantBaseline="middle" textAnchor="end">
            {fmt(yDomain[0])}
          </text>
          {first && latest ? (
            <>
              <text x={INSET.left} y={HEIGHT - 6} textAnchor="start">
                epoch {first.epoch}
              </text>
              <text x={plotRight} y={HEIGHT - 6} textAnchor="end">
                {latest.epoch}
              </text>
            </>
          ) : (
            <text x={(INSET.left + plotRight) / 2} y={(INSET.top + midY) / 2} dominantBaseline="middle" textAnchor="middle">
              No epochs yet
            </text>
          )}
        </g>
        {keys.map((k) => {
          const points = toSvgPoints(
            history.map((m) => m[k]),
            box,
          );
          if (points.length === 0) return null;
          // A lone epoch has no segment to draw, so mark it with a dot.
          return points.length === 1 ? (
            <circle key={k} cx={points[0].x} cy={points[0].y} r={4} className={SERIES[k].fill} />
          ) : (
            <polyline
              key={k}
              points={pointsAttr(points)}
              fill="none"
              className={SERIES[k].stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
    </figure>
  );
}

export default function TrainingChart({ history }: { history: readonly EpochMetric[] }) {
  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <Panel
        title="Loss"
        history={history}
        keys={["intent_loss", "amount_loss"]}
        yDomain={lossDomain(history)}
      />
      <Panel title="Accuracy" history={history} keys={["intent_accuracy"]} yDomain={[0, 1]} />
    </div>
  );
}

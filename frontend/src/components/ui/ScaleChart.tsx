// Step 7's "how big is the gap?" chart: one horizontal bar per ratio on a log
// axis from 1 to 10^MAX_DECADE. Hand-rolled SVG like TrainingChart, no chart
// library. All text is HTML, not SVG <text>, so it stays readable at phone
// width instead of shrinking with the viewBox; the SVG only draws the bars and
// the grid, stretched to the row's width.

import { formatLargeNumber, logBarFraction } from "@/lib/costReceipt";

/** The axis ends at 10^15; the largest ratios here are around 10^12. */
const MAX_DECADE = 15;
/** A grid line every 3 decades: thousand, million, billion, trillion. */
const TICKS = [3, 6, 9, 12].map((d) => ({ fraction: d / MAX_DECADE, label: formatLargeNumber(10 ** d) }));

export interface ScaleRow {
  label: string;
  /** How many times larger the LLM's figure is; null when the student's side is missing. */
  ratio: number | null;
  /** Shown under the bar, e.g. why the comparison is approximate. */
  note?: string;
  /** Shown instead of a bar when `ratio` is null. */
  emptyText: string;
}

function Bar({ ratio, label }: { ratio: number; label: string }) {
  const width = logBarFraction(ratio, MAX_DECADE) * 100;
  return (
    <svg
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      className="block h-4 w-full"
      role="img"
      aria-label={`${label}: about ${formatLargeNumber(ratio)} times`}
    >
      <rect x={0} y={0} width={100} height={10} className="fill-slate-100 dark:fill-slate-800" />
      <rect x={0} y={1} width={width} height={8} rx={0.5} className="fill-sky-600 dark:fill-sky-500" />
      {TICKS.map((t) => (
        <line
          key={t.fraction}
          x1={t.fraction * 100}
          x2={t.fraction * 100}
          y1={0}
          y2={10}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export default function ScaleChart({ rows }: { rows: readonly ScaleRow[] }) {
  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium text-slate-800 dark:text-slate-200">{row.label}</span>
            {row.ratio !== null ? (
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                about {formatLargeNumber(row.ratio)} times
              </span>
            ) : null}
          </p>
          {row.ratio !== null ? (
            <Bar ratio={row.ratio} label={row.label} />
          ) : (
            <p className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-400">
              {row.emptyText}
            </p>
          )}
          {row.note ? <p className="text-xs text-slate-600 dark:text-slate-400">{row.note}</p> : null}
        </div>
      ))}

      {/* The shared axis: the same percentages as the grid lines in each bar. */}
      <div aria-hidden className="relative h-8 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="absolute left-0 top-0">1×</span>
        {TICKS.map((t, i) => (
          <span
            key={t.fraction}
            className={`absolute -translate-x-1/2 text-center leading-tight ${i % 2 === 1 ? "top-4" : "top-0"}`}
            style={{ left: `${t.fraction * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Logarithmic scale: each grid line is 1,000 times the one before.
      </p>
    </div>
  );
}

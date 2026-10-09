import type { CompareResult } from "@/lib/nlp/simulator";
import Callout from "./Callout";
import CodeBlock from "./CodeBlock";

export interface BandMessages {
  success: (distance: string) => string;
  info: (distance: string) => string;
  warning: (distance: string) => string;
}

/** Distance thresholds: below `success` is success, below `info` is info, else warning. */
export interface DistanceBands {
  success: number;
  info: number;
}

// The prototype's tile-scale thresholds. Centimeter-scale callers pass their
// own (Steps 5 and 6 use HELD_OUT_PATH_BANDS from lib/nlp/grading).
const DEFAULT_BANDS: DistanceBands = { success: 0.5, info: 1.5 };

// Renders the success/info/warning band for the end-position distance (below
// bands.success / below bands.info / otherwise) plus the side-by-side command
// lists, matching the prototype's compare_paths output. `showLists={false}`
// drops the lists for a caller that shows several comparisons and renders the
// lists once itself (Step 6).
export default function DistanceResult({
  result,
  messages,
  bands = DEFAULT_BANDS,
  studentLabel = "Your Commands",
  showLists = true,
}: {
  result: CompareResult;
  messages: BandMessages;
  bands?: DistanceBands;
  /** Heading of the first list column. */
  studentLabel?: string;
  showLists?: boolean;
}) {
  const d = result.distance;
  const dStr = d.toFixed(2);

  const tone = d < bands.success ? "success" : d < bands.info ? "info" : "warning";
  const message =
    tone === "success" ? messages.success(dStr) : tone === "info" ? messages.info(dStr) : messages.warning(dStr);

  return (
    <div className="mt-4 space-y-4">
      <Callout tone={tone}>{message}</Callout>
      {showLists ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{studentLabel}</p>
            <CodeBlock text={result.studentList.join("\n")} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Reference Commands</p>
            <CodeBlock text={result.refList.join("\n")} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

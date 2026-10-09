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
// own (Step 5 uses HELD_OUT_PATH_BANDS from lib/nlp/grading).
const DEFAULT_BANDS: DistanceBands = { success: 0.5, info: 1.5 };

// Renders the success/info/warning band for the end-position distance (below
// bands.success / below bands.info / otherwise) plus the side-by-side command
// lists, matching the prototype's compare_paths output.
export default function DistanceResult({
  result,
  messages,
  bands = DEFAULT_BANDS,
}: {
  result: CompareResult;
  messages: BandMessages;
  bands?: DistanceBands;
}) {
  const d = result.distance;
  const dStr = d.toFixed(2);

  const tone = d < bands.success ? "success" : d < bands.info ? "info" : "warning";
  const message =
    tone === "success" ? messages.success(dStr) : tone === "info" ? messages.info(dStr) : messages.warning(dStr);

  return (
    <div className="mt-4 space-y-4">
      <Callout tone={tone}>{message}</Callout>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Your Commands</p>
          <CodeBlock text={result.studentList.join("\n")} />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Reference Commands</p>
          <CodeBlock text={result.refList.join("\n")} />
        </div>
      </div>
    </div>
  );
}

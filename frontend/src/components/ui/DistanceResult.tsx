import type { CompareResult } from "@/lib/nlp/simulator";
import Callout from "./Callout";
import CodeBlock from "./CodeBlock";

export interface BandMessages {
  success: (distance: string) => string;
  info: (distance: string) => string;
  warning: (distance: string) => string;
}

// Renders the <0.5 / <1.5 / else success-info-warning band plus the
// side-by-side command lists, matching the prototype's compare_paths output.
export default function DistanceResult({
  result,
  messages,
}: {
  result: CompareResult;
  messages: BandMessages;
}) {
  const d = result.distance;
  const dStr = d.toFixed(2);

  const tone = d < 0.5 ? "success" : d < 1.5 ? "info" : "warning";
  const message =
    d < 0.5 ? messages.success(dStr) : d < 1.5 ? messages.info(dStr) : messages.warning(dStr);

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

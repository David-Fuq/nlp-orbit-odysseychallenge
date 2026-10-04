import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning";

const TONE_STYLES: Record<Tone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
};

export default function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 text-sm leading-relaxed ${TONE_STYLES[tone]}`}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

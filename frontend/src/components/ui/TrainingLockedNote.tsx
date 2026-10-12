"use client";

// Steps 2 and 3 stay editable after the final test; this says why edits no
// longer matter. Renders nothing until the final test is taken.

import { useMission } from "@/state/MissionContext";

export default function TrainingLockedNote() {
  const { state } = useMission();
  if (state.final_test === null) return null;
  return (
    <p
      role="note"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      You&apos;ve taken the final test, so training is locked. You can still edit your dataset, but changes
      won&apos;t affect your model.
    </p>
  );
}

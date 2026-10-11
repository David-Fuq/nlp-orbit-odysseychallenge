import Link from "next/link";
import { INTENT_LABELS, type Intent } from "@/lib/nlp/intents";
import Callout from "./Callout";

/** Why Train/Retrain is disabled: the dataset has no examples of some intents. */
export default function MissingIntentsCallout({ missing }: { missing: readonly Intent[] }) {
  if (missing.length === 0) return null;
  const names = missing.map((i) => INTENT_LABELS[i]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return (
    <Callout tone="warning" title="Add the missing commands before training">
      <p>
        Your dataset has no examples of <strong>{list}</strong>. A model can&apos;t learn a command
        it has never seen, so it would get every one of those wrong.
      </p>
      <p>
        Label some in{" "}
        <Link href="/steps/2" className="font-medium underline">
          Step 2
        </Link>{" "}
        or check your dataset in{" "}
        <Link href="/steps/3" className="font-medium underline">
          Step 3
        </Link>
        .
      </p>
    </Callout>
  );
}

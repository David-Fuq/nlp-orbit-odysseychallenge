import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Lunar NLP Mission Log Trainer</h1>
      <p className="text-slate-700 dark:text-slate-300">
        Teach your robot to <strong>understand language from Mission Control</strong>:
      </p>
      <ul className="list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-300">
        <li>Break text into important pieces (tokenization &amp; info extraction)</li>
        <li>Turn sentences into robot commands (intent + parameters)</li>
        <li>Build a tiny language → command dictionary</li>
        <li>Test on a new mission log and compare with an LLM</li>
      </ul>
      <Link
        href="/steps/1"
        className="inline-flex items-center rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
      >
        Start the mission →
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STEPS } from "@/lib/steps";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-full shrink-0 border-b border-slate-200 bg-white p-4 sm:w-64 sm:border-b-0 sm:border-r dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Mission Steps
      </p>
      <ul className="space-y-1">
        {STEPS.map((step) => {
          const href = `/steps/${step.n}`;
          const active = pathname === href;
          return (
            <li key={step.n}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sky-600 text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-white text-sky-700"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {step.n}
                </span>
                <span>{step.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

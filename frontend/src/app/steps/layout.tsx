import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";

export default function StepsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm sm:flex-row">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-8">{children}</main>
    </div>
  );
}

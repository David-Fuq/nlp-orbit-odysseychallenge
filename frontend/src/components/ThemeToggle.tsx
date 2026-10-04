"use client";

import { useTheme } from "@/state/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle light / dark mode"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-base text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {/* The server always renders the light-mode icon; the client reads the
          real stored/system theme on first render, so this text can differ
          from the server markup — that's expected, not a bug. */}
      <span suppressHydrationWarning>{theme === "dark" ? "🌙" : "☀️"}</span>
    </button>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MissionProvider } from "@/state/MissionContext";
import { ThemeProvider } from "@/state/ThemeContext";
import TopNav from "@/components/TopNav";

// Runs before React hydrates so the correct data-theme attribute is on
// <html> from the first paint, avoiding a light/dark flash.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lunar NLP Mission Log Trainer",
  description:
    "Teach a robot to understand language from Mission Control: tokenize a lunar mission log, turn it into robot commands, and compare with an LLM.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <TopNav />
          <MissionProvider>
            <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</div>
          </MissionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

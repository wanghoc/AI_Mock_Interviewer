import Link from "next/link";
import { GitBranch, Sparkles } from "lucide-react";

export function FloatingHeader() {
  return (
    <header className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <div className="animate-fade-in-up flex w-full max-w-5xl items-center justify-between rounded-full border border-white/80 bg-white/65 px-4 py-3 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 font-[family-name:var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-100 bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700 transition-transform duration-300 group-hover:scale-105">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            AI Mock Interviewer
          </span>
        </Link>

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:border-slate-300 hover:bg-white hover:text-slate-900"
        >
          <GitBranch className="h-4 w-4" />
          Github Repo
        </a>
      </div>
    </header>
  );
}

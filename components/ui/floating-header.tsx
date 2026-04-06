import Link from "next/link";

export function FloatingHeader() {
  return (
    <header className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <div className="animate-fade-in-up flex w-full max-w-5xl items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] sm:px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold tracking-tight"
        >
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">
            AI Mock Interviewer
          </span>
        </Link>

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-violet-200/30 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition-all duration-300 hover:border-violet-300/60 hover:bg-violet-400/10 hover:text-white hover:shadow-[0_0_24px_rgba(139,92,246,0.45)]"
        >
          Github Repo
        </a>
      </div>
    </header>
  );
}

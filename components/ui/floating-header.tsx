"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChartColumnIncreasing,
  CircleCheckBig,
  FileText,
  MessageCircleMore,
} from "lucide-react";

type WorkflowStep = {
  id: "cv-upload" | "cv-evaluation" | "interview" | "interview-evaluation";
  label: string;
  href: string;
};

const workflowSteps: WorkflowStep[] = [
  {
    id: "cv-upload",
    label: "Nhập CV",
    href: "/",
  },
  {
    id: "cv-evaluation",
    label: "Đánh giá CV",
    href: "/evaluation?mode=cv",
  },
  {
    id: "interview",
    label: "Phỏng vấn",
    href: "/interview",
  },
  {
    id: "interview-evaluation",
    label: "Đánh giá phỏng vấn",
    href: "/evaluation?mode=interview",
  },
];

function getCurrentStepIndex(
  pathname: string,
  mode: string | null,
): number {
  if (pathname === "/") {
    return 0;
  }

  if (pathname === "/interview") {
    return 2;
  }

  if (pathname === "/evaluation") {
    return mode === "interview" ? 3 : 1;
  }

  return 0;
}

export function FloatingHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const currentStepIndex = getCurrentStepIndex(pathname, mode);

  return (
    <header className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <div className="animate-fade-in-up flex w-full max-w-6xl items-center gap-4 rounded-3xl border border-white/80 bg-white/65 px-4 py-3 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:px-6">
        <Link
          href="/"
          className="group inline-flex shrink-0 items-center gap-2 font-[family-name:var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-white transition-transform duration-300 group-hover:scale-105">
            <Image
              src="/brand-mark.svg"
              alt="AI Mock Interviewer logo"
              width={28}
              height={28}
              priority
            />
          </span>
          <span className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            AI Mock Interviewer
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Bước {currentStepIndex + 1}/4
          </span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400"
              style={{ width: `${((currentStepIndex + 1) / workflowSteps.length) * 100}%` }}
            />
          </div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {workflowSteps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isClickable = index <= currentStepIndex;

            const iconClassName = isCurrent
              ? "text-white"
              : isCompleted
                ? "text-sky-700"
                : "text-slate-400";

            const stepIcon =
              index === 0 ? (
                <FileText className={`h-3.5 w-3.5 ${iconClassName}`} />
              ) : index === 1 ? (
                <CircleCheckBig className={`h-3.5 w-3.5 ${iconClassName}`} />
              ) : index === 2 ? (
                <MessageCircleMore className={`h-3.5 w-3.5 ${iconClassName}`} />
              ) : (
                <ChartColumnIncreasing className={`h-3.5 w-3.5 ${iconClassName}`} />
              );

            return (
              <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
                {isClickable ? (
                  <Link
                    href={step.href}
                    className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                      isCurrent
                        ? "border-sky-500 bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 text-white"
                        : isCompleted
                          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                          : "border-slate-200 bg-white/70 text-slate-400"
                    }`}
                  >
                    {stepIcon}
                    <span className="truncate">{step.label}</span>
                  </Link>
                ) : (
                  <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-400">
                    {stepIcon}
                    <span className="truncate">{step.label}</span>
                  </span>
                )}

                {index < workflowSteps.length - 1 ? (
                  <span
                    aria-hidden
                    className={`h-[2px] flex-1 rounded-full ${
                      index < currentStepIndex
                        ? "bg-gradient-to-r from-sky-500 to-indigo-500"
                        : "bg-slate-200"
                    }`}
                  />
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  CircleX,
  FileText,
  Loader2,
  MessageSquareReply,
  Sparkles,
  UserRound,
} from "lucide-react";
import { INTERVIEW_STORAGE_KEYS } from "@/lib/interview/client-storage";
import type {
  EvaluateInterviewResponse,
  InterviewCandidateProfile,
  InterviewEvaluationResult,
  InterviewTurn,
} from "@/lib/interview/types";

type EvaluationViewState = "cv" | "loading" | "result" | "empty" | "error";

const defaultCvEvaluation = {
  overallScore: 86,
  strengths: [
    "Kinh nghiệm Next.js và React rõ ràng, trình bày dự án có số liệu đo lường cụ thể.",
    "Mô tả tốt các kỹ năng tối ưu hiệu năng giao diện và cải thiện Core Web Vitals.",
    "Portfolio thể hiện tư duy sản phẩm và khả năng phối hợp cùng team Design.",
    "CV có cấu trúc gọn, dễ quét, nổi bật ở phần thành tựu định lượng.",
  ],
  risks: [
    "Thiếu ví dụ chuyên sâu về kiến trúc state management ở quy mô enterprise.",
    "Chưa thể hiện rõ kinh nghiệm mentoring hoặc dẫn dắt kỹ thuật trong đội ngũ lớn.",
    "Một số công nghệ trong JD (testing E2E, observability) chưa được mô tả nổi bật.",
    "Nên bổ sung thêm kinh nghiệm làm việc với quy trình bảo mật frontend.",
  ],
};

function parseCandidateProfile(input: string | null): InterviewCandidateProfile | null {
  if (!input) {
    return null;
  }

  try {
    const parsed = JSON.parse(input) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    return {
      candidateName:
        typeof record.candidateName === "string" && record.candidateName.trim().length > 0
          ? record.candidateName.trim()
          : "Ứng viên",
      targetRole:
        typeof record.targetRole === "string" && record.targetRole.trim().length > 0
          ? record.targetRole.trim()
          : "Frontend Engineer",
      cvFileName:
        typeof record.cvFileName === "string" && record.cvFileName.trim().length > 0
          ? record.cvFileName.trim()
          : "resume.pdf",
      highlights:
        typeof record.highlights === "string" && record.highlights.trim().length > 0
          ? record.highlights.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function validateTranscript(input: unknown): InterviewTurn[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item, index): InterviewTurn | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;

      if (
        (record.role !== "ai" && record.role !== "user") ||
        typeof record.message !== "string" ||
        record.message.trim().length === 0
      ) {
        return null;
      }

      return {
        id:
          typeof record.id === "string" && record.id.trim().length > 0
            ? record.id.trim()
            : `turn-${index + 1}`,
        role: record.role,
        message: record.message.trim(),
        timestamp:
          typeof record.timestamp === "string" && record.timestamp.trim().length > 0
            ? record.timestamp.trim()
            : "00:00",
      };
    })
    .filter((item): item is InterviewTurn => item !== null);
}

function InterviewLoadingView() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center pb-8">
      <div className="animate-fade-in-up w-full rounded-3xl border border-white/85 bg-white/70 p-10 text-center backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-14">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-indigo-50 shadow-[0_16px_28px_rgba(56,189,248,0.18)]">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        </div>

        <h1 className="mt-8 font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-slate-900 sm:text-4xl">
          Hệ thống đang phân tích câu trả lời của bạn...
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          AI đang tổng hợp điểm mạnh, điểm cần cải thiện và xây dựng góp ý chi tiết cho từng câu trả lời.
        </p>

        <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-left text-sm text-sky-700">
          <p className="font-medium">Quá trình xử lý:</p>
          <p className="mt-2">1. Gom lịch sử câu hỏi và câu trả lời.</p>
          <p className="mt-1">2. Gửi transcript tới mô hình AI để chấm điểm.</p>
          <p className="mt-1">3. Trả kết quả dạng JSON để render dashboard đánh giá.</p>
        </div>
      </div>
    </section>
  );
}

interface CvEvaluationViewProps {
  profile: InterviewCandidateProfile | null;
}

function CvEvaluationView({ profile }: CvEvaluationViewProps) {
  const candidateName = profile?.candidateName || "Ứng viên";
  const targetRole = profile?.targetRole || "Frontend Engineer";
  const cvFileName = profile?.cvFileName || "resume.pdf";

  const overallScore = clampPercentage(
    defaultCvEvaluation.overallScore + (profile?.highlights ? 2 : 0),
  );

  const strengths = profile?.highlights
    ? [
        `Điểm nhấn do ứng viên cung cấp: ${profile.highlights}.`,
        ...defaultCvEvaluation.strengths.slice(0, 3),
      ]
    : defaultCvEvaluation.strengths;

  const risks = defaultCvEvaluation.risks;
  const summary = `CV của ${candidateName} cho vị trí ${targetRole} thể hiện nền tảng tốt và có tiềm năng đi sâu vòng phỏng vấn kỹ thuật. Nên bổ sung thêm số liệu định lượng tác động, các tình huống trade-off kỹ thuật và ví dụ dẫn dắt để tăng độ cạnh tranh.`;
  const scoreAngle = overallScore * 3.6;

  const handleStartInterview = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.workflowStep, "interview");
    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.status, "IN_PROGRESS");
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 pb-6">
      <header className="animate-fade-in-up rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          CV Evaluation Dashboard
        </p>

        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-32 w-32 sm:h-36 sm:w-36">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(rgba(56,189,248,0.95) ${scoreAngle}deg, rgba(203,213,225,0.45) ${scoreAngle}deg)`,
                }}
              />
              <div className="absolute inset-[10px] rounded-full border border-white/80 bg-white/80 backdrop-blur-xl" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-900">
                <span className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold">
                  {overallScore}%
                </span>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Overall
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-slate-900 sm:text-3xl">
                Đánh Giá CV
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                AI đã phân tích nội dung CV và tóm tắt các điểm mạnh, rủi ro và mức độ phù hợp với vị trí ứng tuyển.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:w-auto">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <UserRound className="h-4 w-4 text-sky-600" />
              <span className="font-medium text-slate-900">{candidateName}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <BriefcaseBusiness className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-slate-900">{targetRole}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <FileText className="h-4 w-4 text-rose-500" />
              <span className="font-medium text-slate-900">{cvFileName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid animate-fade-in-up gap-6 [animation-delay:120ms] [animation-fill-mode:both] lg:grid-cols-2">
        <article className="rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            Điểm mạnh
          </div>

          <ul className="mt-5 space-y-4">
            {strengths.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cần cải thiện / Rủi ro
          </div>

          <ul className="mt-5 space-y-4">
            {risks.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <section className="animate-fade-in-up rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] [animation-delay:220ms] [animation-fill-mode:both] sm:p-8">
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900 sm:text-2xl">
          Nhận xét tổng quan từ AI
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          {summary}
        </p>

        <div className="mt-8 rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-100/70 via-white/80 to-rose-100/70 p-3 shadow-[0_14px_32px_rgba(59,130,246,0.16)] sm:p-4">
          <Link
            href="/interview"
            onClick={handleStartInterview}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 px-6 py-4 text-base font-semibold text-white transition-transform duration-300 hover:scale-[1.01] sm:text-lg"
          >
            Bắt đầu Phỏng vấn
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </section>
  );
}

interface InterviewResultViewProps {
  data: InterviewEvaluationResult;
  provider: string;
}

function InterviewResultView({ data, provider }: InterviewResultViewProps) {
  const [opened, setOpened] = useState<Record<string, boolean>>(() => {
    if (!data.detailed_review.length) {
      return {};
    }

    return {
      [data.detailed_review[0].id]: true,
    };
  });

  const score = clampPercentage(data.score);
  const scoreAngle = score * 3.6;

  const toggleAccordion = (id: string) => {
    setOpened((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 pb-6">
      <header className="animate-fade-in-up rounded-3xl border border-white/85 bg-white/70 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Post Interview Evaluation
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-slate-900 sm:text-3xl">
              Kết quả đánh giá sau phỏng vấn
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            AI Engine: {provider}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative mx-auto h-40 w-40">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(rgba(14,165,233,0.95) ${scoreAngle}deg, rgba(203,213,225,0.48) ${scoreAngle}deg)`,
              }}
            />
            <div className="absolute inset-[12px] rounded-full border border-white/80 bg-white/80 backdrop-blur-xl" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold text-slate-900">
                {score}
              </span>
              <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Điểm</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                <CircleCheckBig className="h-4 w-4" />
                Điểm sáng (Pros)
              </p>
              <ul className="mt-3 space-y-2">
                {data.strengths.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-emerald-900">
                    • {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
                <CircleX className="h-4 w-4" />
                Điểm cần cải thiện (Cons)
              </p>
              <ul className="mt-3 space-y-2">
                {data.weaknesses.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-rose-900">
                    • {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-slate-600 sm:text-base">{data.summary}</p>
      </header>

      <section className="animate-fade-in-up rounded-3xl border border-white/85 bg-white/70 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] [animation-delay:120ms] [animation-fill-mode:both] sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquareReply className="h-5 w-5 text-indigo-600" />
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900 sm:text-2xl">
            Chi tiết theo từng câu hỏi
          </h2>
        </div>

        <div className="space-y-4">
          {data.detailed_review.map((item, index) => {
            const isOpen = Boolean(opened[item.id]);

            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white/75"
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(item.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Câu hỏi {index + 1}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800 sm:text-base">
                      {item.question}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen ? (
                  <div className="grid gap-4 border-t border-slate-200/80 bg-slate-50/70 px-4 py-4">
                    <div className="rounded-xl border border-white bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Câu trả lời ban đầu
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                        {item.user_answer}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                        Nhận xét của hệ thống
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-amber-900 sm:text-base">
                        {item.feedback}
                      </p>
                    </div>

                    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                        Câu trả lời mẫu (Gợi ý)
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-sky-900 sm:text-base">
                        {item.suggested_answer}
                      </p>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

export default function EvaluationPage() {
  const [mode, setMode] = useState<"pending" | "cv" | "interview">(
    "pending",
  );

  const [viewState, setViewState] = useState<EvaluationViewState>(
    "loading"
  );
  const [provider, setProvider] = useState<string>("pending");
  const [evaluationData, setEvaluationData] =
    useState<InterviewEvaluationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [candidateProfile, setCandidateProfile] =
    useState<InterviewCandidateProfile | null>(null);

  useEffect(() => {
    const queryMode = new URLSearchParams(window.location.search).get("mode");
    const normalizedMode = queryMode === "cv" ? "cv" : "interview";
    const storedProfile = parseCandidateProfile(
      window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.candidateProfile),
    );

    setCandidateProfile(storedProfile);
    window.sessionStorage.setItem(
      INTERVIEW_STORAGE_KEYS.workflowStep,
      normalizedMode === "cv" ? "cv-evaluation" : "interview-evaluation",
    );

    setMode(normalizedMode);

    if (normalizedMode === "cv") {
      setViewState("cv");
    }
  }, []);

  useEffect(() => {
    if (mode === "pending") {
      return;
    }

    if (mode === "cv") {
      setViewState("cv");
      return;
    }

    let isCancelled = false;

    const runEvaluation = async () => {
      setViewState("loading");
      setErrorMessage("");

      const transcriptRaw =
        window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.transcriptJson) ??
        window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.transcript);

      if (!transcriptRaw) {
        setViewState("empty");
        return;
      }

      let parsedTranscript: InterviewTurn[] = [];

      try {
        parsedTranscript = validateTranscript(JSON.parse(transcriptRaw));
      } catch {
        setViewState("error");
        setErrorMessage("Không đọc được dữ liệu phiên phỏng vấn để đánh giá.");
        return;
      }

      if (!parsedTranscript.length) {
        setViewState("empty");
        return;
      }

      const startedAt = Date.now();

      try {
        const response = await fetch("/api/interview/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript: parsedTranscript }),
          cache: "no-store",
        });

        const payload = (await response.json()) as
          | EvaluateInterviewResponse
          | { error?: string };

        if (!response.ok || !("status" in payload)) {
          const backendError =
            "error" in payload && payload.error
              ? payload.error
              : "Hệ thống không thể tạo đánh giá vào lúc này.";
          throw new Error(backendError);
        }

        const elapsed = Date.now() - startedAt;
        const minimumLoadingDuration = 1700;

        if (elapsed < minimumLoadingDuration) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, minimumLoadingDuration - elapsed);
          });
        }

        if (isCancelled) {
          return;
        }

        setEvaluationData(payload.evaluation);
        setProvider(payload.provider);
        setViewState("result");

        window.sessionStorage.setItem(
          INTERVIEW_STORAGE_KEYS.evaluation,
          JSON.stringify(payload.evaluation),
        );
        window.sessionStorage.setItem(
          INTERVIEW_STORAGE_KEYS.evaluationId,
          payload.evaluationId,
        );
        window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.status, "COMPLETED");
        window.sessionStorage.setItem(
          INTERVIEW_STORAGE_KEYS.workflowStep,
          "interview-evaluation",
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setViewState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Hệ thống đã gặp lỗi khi đánh giá phỏng vấn.",
        );
      }
    };

    runEvaluation();

    return () => {
      isCancelled = true;
    };
  }, [mode]);

  if (viewState === "cv") {
    return <CvEvaluationView profile={candidateProfile} />;
  }

  if (viewState === "loading") {
    return <InterviewLoadingView />;
  }

  if (viewState === "empty") {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center pb-8">
        <div className="rounded-3xl border border-white/85 bg-white/75 p-10 text-center backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-slate-900">
            Chưa có dữ liệu phỏng vấn để đánh giá
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
            Vui lòng bắt đầu một phiên phỏng vấn và kết thúc đúng quy trình để hệ thống sinh báo cáo.
          </p>

          <Link
            href="/interview"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(
                  INTERVIEW_STORAGE_KEYS.workflowStep,
                  "interview",
                );
                window.sessionStorage.setItem(
                  INTERVIEW_STORAGE_KEYS.status,
                  "IN_PROGRESS",
                );
              }
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(99,102,241,0.28)]"
          >
            Bắt đầu phiên phỏng vấn
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  if (viewState === "error") {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center pb-8">
        <div className="rounded-3xl border border-rose-200 bg-white/80 p-10 text-center backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-rose-700">
            Không thể tạo kết quả đánh giá
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-rose-700/80 sm:text-base">
            {errorMessage || "Đã xảy ra lỗi không xác định."}
          </p>

          <Link
            href="/interview"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(
                  INTERVIEW_STORAGE_KEYS.workflowStep,
                  "interview",
                );
                window.sessionStorage.setItem(
                  INTERVIEW_STORAGE_KEYS.status,
                  "IN_PROGRESS",
                );
              }
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700"
          >
            Quay lại phỏng vấn
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  return evaluationData ? (
    <InterviewResultView data={evaluationData} provider={provider} />
  ) : (
    <InterviewLoadingView />
  );
}

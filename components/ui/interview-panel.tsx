"use client";

import { ChatBubble } from "@/components/ui/chat-bubble";
import { ChatComposer } from "@/components/ui/chat-composer";
import { INTERVIEW_STORAGE_KEYS } from "@/lib/interview/client-storage";
import type {
  CvEvaluationResult,
  InterviewCandidateProfile,
  InterviewChatResponse,
  InterviewSessionStatus,
  InterviewTurn,
} from "@/lib/interview/types";
import {
  CircleAlert,
  Clock3,
  FileBadge2,
  ListChecks,
  Loader2,
  OctagonX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const initialTranscript: InterviewTurn[] = [
  {
    id: "turn-1",
    role: "ai",
    timestamp: "09:01",
    message:
      "Xin chào! Hãy giới thiệu ngắn gọn về bản thân và lý do bạn quan tâm vị trí ứng tuyển hiện tại.",
  },
];

const fallbackFollowUpQuestions = [
  "Bạn hãy chia sẻ một dự án gần nhất mà bạn tự hào nhất và vai trò cụ thể của bạn trong dự án đó?",
  "Khi hiệu năng giảm sau khi release, bạn ưu tiên xử lý theo các bước nào?",
  "Bạn đánh giá chất lượng code của chính mình trong team bằng những tiêu chí nào?",
];

function formatCurrentTime() {
  return new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseStoredTranscript(input: string | null): InterviewTurn[] {
  if (!input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
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
            typeof record.timestamp === "string" &&
            record.timestamp.trim().length > 0
              ? record.timestamp.trim()
              : "00:00",
        };
      })
      .filter((item): item is InterviewTurn => item !== null);
  } catch {
    return [];
  }
}

function getFallbackQuestion(transcript: InterviewTurn[]): string {
  const aiTurns = transcript.filter((item) => item.role === "ai").length;
  return fallbackFollowUpQuestions[aiTurns % fallbackFollowUpQuestions.length];
}

function buildIntroQuestion(role: string): string {
  return `Xin chào! Hãy giới thiệu ngắn gọn về bản thân và lý do bạn quan tâm vị trí ${role}.`;
}

function parseCandidateProfile(): InterviewCandidateProfile | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.candidateProfile);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    const candidateName =
      typeof record.candidateName === "string" ? record.candidateName.trim() : "";
    const targetRole =
      typeof record.targetRole === "string" ? record.targetRole.trim() : "";
    const cvFileName =
      typeof record.cvFileName === "string" ? record.cvFileName.trim() : "";

    return {
      candidateName: candidateName || "Ứng viên",
      targetRole: targetRole || "Vị trí ứng tuyển",
      cvFileName: cvFileName || "resume.pdf",
      highlights:
        typeof record.highlights === "string" ? record.highlights.trim() : undefined,
    };
  } catch {
    return undefined;
  }
}

function parseStoredCvEvaluation(input: string | null): CvEvaluationResult | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;

    const projectBreakdown = Array.isArray(record.project_breakdown)
      ? record.project_breakdown
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const projectRecord = item as Record<string, unknown>;

            const project_or_experience =
              typeof projectRecord.project_or_experience === "string"
                ? projectRecord.project_or_experience.trim()
                : "";
            const standout_points =
              typeof projectRecord.standout_points === "string"
                ? projectRecord.standout_points.trim()
                : "";
            const unclear_points =
              typeof projectRecord.unclear_points === "string"
                ? projectRecord.unclear_points.trim()
                : "";

            if (!project_or_experience || !standout_points || !unclear_points) {
              return null;
            }

            return {
              project_or_experience,
              standout_points,
              unclear_points,
            };
          })
          .filter(
            (
              item,
            ): item is {
              project_or_experience: string;
              standout_points: string;
              unclear_points: string;
            } => item !== null,
          )
      : [];

    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    return {
      score: typeof record.score === "number" ? record.score : 0,
      strengths: asStringArray(record.strengths),
      weaknesses: asStringArray(record.weaknesses),
      role_alignment: asStringArray(record.role_alignment),
      interview_focus: asStringArray(record.interview_focus),
      recommended_roles: asStringArray(record.recommended_roles).slice(0, 3),
      role_alignment_analysis:
        typeof record.role_alignment_analysis === "string"
          ? record.role_alignment_analysis
          : "",
      project_breakdown: projectBreakdown,
      red_flags: asStringArray(record.red_flags),
      drill_down_questions: asStringArray(record.drill_down_questions).slice(0, 3),
      summary: typeof record.summary === "string" ? record.summary : "",
    };
  } catch {
    return undefined;
  }
}

export function InterviewPanel() {
  const router = useRouter();

  const [transcript, setTranscript] = useState<InterviewTurn[]>(initialTranscript);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionStatus, setSessionStatus] =
    useState<InterviewSessionStatus>("IN_PROGRESS");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isAwaitingAi, setIsAwaitingAi] = useState(false);
  const [chatProvider, setChatProvider] = useState<string>("fallback");
  const [chatError, setChatError] = useState<string>("");
  const [candidateProfile, setCandidateProfile] =
    useState<InterviewCandidateProfile | undefined>(undefined);
  const [cvContext, setCvContext] = useState("");
  const [cvEvaluation, setCvEvaluation] =
    useState<CvEvaluationResult | undefined>(undefined);

  const isEvaluating = sessionStatus === "EVALUATING";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTranscript = parseStoredTranscript(
      window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.transcriptJson) ??
        window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.transcript),
    );

    if (storedTranscript.length > 0) {
      setTranscript(storedTranscript);
    } else {
      const profile = parseCandidateProfile();
      const role = profile?.targetRole || "vị trí ứng tuyển";

      setTranscript([
        {
          id: "turn-1",
          role: "ai",
          timestamp: formatCurrentTime(),
          message: buildIntroQuestion(role),
        },
      ]);
    }

    const storedStatus = window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.status);

    if (
      storedStatus === "IN_PROGRESS" ||
      storedStatus === "EVALUATING" ||
      storedStatus === "COMPLETED"
    ) {
      setSessionStatus(storedStatus);
    }

    setCandidateProfile(parseCandidateProfile());
    setCvContext(
      window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.cvText) ?? "",
    );
    setCvEvaluation(
      parseStoredCvEvaluation(
        window.sessionStorage.getItem(INTERVIEW_STORAGE_KEYS.cvEvaluation),
      ),
    );
    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.workflowStep, "interview");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const transcriptJson = JSON.stringify(transcript);
    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.transcript, transcriptJson);
    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.transcriptJson, transcriptJson);
  }, [transcript]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.status, sessionStatus);
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "IN_PROGRESS") {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [sessionStatus]);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  const appendAiMessage = (message: string) => {
    const aiTurn: InterviewTurn = {
      id: `turn-${Date.now()}-ai`,
      role: "ai",
      message,
      timestamp: formatCurrentTime(),
    };

    setTranscript((current) => [...current, aiTurn]);
  };

  const handleSendMessage = async (message: string) => {
    if (isEvaluating || isAwaitingAi) {
      return;
    }

    const userMessage: InterviewTurn = {
      id: `turn-${Date.now()}-user`,
      role: "user",
      message,
      timestamp: formatCurrentTime(),
    };

    const nextTranscript = [...transcript, userMessage];

    setChatError("");
    setTranscript(nextTranscript);
    setIsAwaitingAi(true);

    try {
      const response = await fetch("/api/interview/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          transcript: nextTranscript,
          language: "vi",
          profile: candidateProfile,
          cvContext,
          cvEvaluation,
        }),
      });

      const payload = (await response.json()) as
        | InterviewChatResponse
        | { error?: string };

      if (!response.ok || !("status" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Không thể nhận câu hỏi mới từ AI.",
        );
      }

      setChatProvider(payload.provider);
      setTranscript((current) => [...current, payload.message]);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "Đã xảy ra lỗi trong quá trình hội thoại AI.",
      );

      const role = candidateProfile?.targetRole || "vị trí ứng tuyển";
      const fallback = cvContext.trim()
        ? `Dựa trên CV của bạn cho vị trí ${role}, bạn hãy mô tả dự án tiêu biểu nhất và kết quả định lượng bạn đạt được.`
        : getFallbackQuestion(nextTranscript);

      appendAiMessage(fallback);
    } finally {
      setIsAwaitingAi(false);
    }
  };

  const handleConfirmEndInterview = () => {
    const transcriptJson = JSON.stringify(transcript);

    setSessionStatus("EVALUATING");
    setIsRedirecting(true);
    setIsConfirmModalOpen(false);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.transcript, transcriptJson);
      window.sessionStorage.setItem(
        INTERVIEW_STORAGE_KEYS.transcriptJson,
        transcriptJson,
      );
      window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.status, "EVALUATING");
      window.sessionStorage.setItem(
        INTERVIEW_STORAGE_KEYS.workflowStep,
        "interview-evaluation",
      );
    }

    router.push("/evaluation?mode=interview");
  };

  return (
    <section className="relative mx-auto w-full max-w-[1280px] pb-28 lg:h-[calc(100vh-10rem)] lg:pb-0">
      <div className="grid h-auto gap-5 lg:h-full lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <div className="flex min-h-[540px] flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:h-full">
          <header className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Phỏng vấn trực tiếp
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900 sm:text-2xl">
                {(candidateProfile?.targetRole || "Vị trí ứng tuyển")} · Phiên phỏng vấn
              </h2>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                isEvaluating
                  ? "border border-amber-200 bg-amber-50 text-amber-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {isEvaluating ? "Đang đánh giá" : "Đang ghi nhận"}
            </span>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
            {transcript.map((item) => (
              <ChatBubble
                key={item.id}
                role={item.role}
                message={item.message}
                timestamp={item.timestamp}
              />
            ))}

            {isAwaitingAi ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-sky-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI đang tạo câu hỏi tiếp theo...
              </div>
            ) : null}
          </div>

          <div className="space-y-3 px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
            {chatError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-700">
                {chatError}
              </div>
            ) : null}

            <ChatComposer
              onSendMessage={handleSendMessage}
              disabled={isEvaluating || isRedirecting || isAwaitingAi}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border border-white/80 bg-white/60 p-5 pb-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6 lg:h-full">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Clock3 className="h-4 w-4 text-sky-600" />
              Thời gian phỏng vấn
            </p>
            <p className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-bold text-slate-900">
              {formattedTimer}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Phiên đang diễn ra ổn định, hội thoại được lưu tự động theo thời gian thực.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
            <CircleAlert className="h-4 w-4" />
            Bạn có thể kết thúc phiên bất cứ lúc nào.
          </div>

          <div className="flex-1 rounded-2xl border border-white/80 bg-white/70 p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <FileBadge2 className="h-4 w-4 text-indigo-600" />
              Tóm tắt CV
            </p>

            <h3 className="mt-3 font-semibold text-slate-900">
              {candidateProfile?.candidateName || "Ứng viên"}
            </h3>
            <p className="text-sm text-slate-500">
              {candidateProfile?.targetRole || "Vị trí ứng tuyển"}
            </p>

            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                Hồ sơ CV đang sử dụng: {candidateProfile?.cvFileName || "resume.pdf"}.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                Động cơ phỏng vấn và chất lượng trả lời đang được ghi nhận liên tục.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                Nhà cung cấp AI hiện tại: {chatProvider}.
              </li>
            </ul>
          </div>

          {isEvaluating ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang chuyển sang trang đánh giá...
            </div>
          ) : null}
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setIsConfirmModalOpen(true)}
        disabled={isEvaluating || isRedirecting}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-[0_10px_28px_rgba(244,63,94,0.2)] transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <OctagonX className="h-4 w-4" />
        Kết thúc phỏng vấn
      </button>

      {isConfirmModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/90 bg-white/90 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
            <h3 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900">
              Xác nhận kết thúc buổi phỏng vấn
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Bạn có chắc chắn muốn kết thúc buổi phỏng vấn và xem kết quả không?
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Tiếp tục phỏng vấn
              </button>
              <button
                type="button"
                onClick={handleConfirmEndInterview}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(251,113,133,0.34)]"
              >
                <OctagonX className="h-4 w-4" />
                Kết thúc và xem kết quả
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { generateInterviewQuestion } from "@/lib/interview/interviewer";
import type {
  CvEvaluationResult,
  InterviewCandidateProfile,
  InterviewChatRequest,
  InterviewChatResponse,
  InterviewTurn,
} from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTranscriptInput(input: unknown): InterviewTurn[] {
  let parsed = input;

  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item, index): InterviewTurn | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const role = record.role;
      const message = record.message;

      if ((role !== "ai" && role !== "user") || typeof message !== "string") {
        return null;
      }

      const normalizedMessage = message.trim();
      if (!normalizedMessage) {
        return null;
      }

      const timestamp =
        typeof record.timestamp === "string" && record.timestamp.trim().length > 0
          ? record.timestamp.trim()
          : "00:00";

      const id =
        typeof record.id === "string" && record.id.trim().length > 0
          ? record.id.trim()
          : `turn-${index + 1}`;

      return {
        id,
        role,
        message: normalizedMessage,
        timestamp,
      };
    })
    .filter((item): item is InterviewTurn => item !== null);
}

function parseCandidateProfile(input: unknown): InterviewCandidateProfile | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const candidateName =
    typeof record.candidateName === "string" ? record.candidateName.trim() : "";
  const targetRole =
    typeof record.targetRole === "string" ? record.targetRole.trim() : "";
  const cvFileName =
    typeof record.cvFileName === "string" ? record.cvFileName.trim() : "";

  if (!candidateName && !targetRole && !cvFileName) {
    return undefined;
  }

  return {
    candidateName: candidateName || "Ứng viên",
    targetRole: targetRole || "Vị trí ứng tuyển",
    cvFileName: cvFileName || "resume.pdf",
    highlights:
      typeof record.highlights === "string" ? record.highlights.trim() : undefined,
  };
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCvEvaluation(input: unknown): CvEvaluationResult | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;

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

  const score = typeof record.score === "number" ? record.score : 0;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";

  if (score <= 0 && summary.length === 0 && projectBreakdown.length === 0) {
    return undefined;
  }

  return {
    score,
    strengths: parseStringArray(record.strengths),
    weaknesses: parseStringArray(record.weaknesses),
    role_alignment: parseStringArray(record.role_alignment),
    interview_focus: parseStringArray(record.interview_focus),
    recommended_roles: parseStringArray(record.recommended_roles).slice(0, 3),
    role_alignment_analysis:
      typeof record.role_alignment_analysis === "string"
        ? record.role_alignment_analysis.trim()
        : "",
    project_breakdown: projectBreakdown,
    red_flags: parseStringArray(record.red_flags),
    drill_down_questions: parseStringArray(record.drill_down_questions).slice(0, 3),
    summary,
  };
}

export async function POST(request: NextRequest) {
  let body: InterviewChatRequest;

  try {
    body = (await request.json()) as InterviewChatRequest;
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu JSON không hợp lệ." },
      { status: 400 },
    );
  }

  const transcript = parseTranscriptInput(body.transcript);

  if (transcript.length === 0) {
    return NextResponse.json(
      {
        error: "Thiếu transcript phỏng vấn để tạo câu hỏi tiếp theo.",
      },
      { status: 400 },
    );
  }

  const language = "vi" as const;
  const profile = parseCandidateProfile(body.profile);
  const cvContext = typeof body.cvContext === "string" ? body.cvContext : "";
  const cvEvaluation = parseCvEvaluation(body.cvEvaluation);

  const generated = await generateInterviewQuestion(
    transcript,
    language,
    profile,
    cvContext,
    cvEvaluation,
  );

  const now = new Date();
  const message: InterviewTurn = {
    id: `turn-${now.getTime()}-ai`,
    role: "ai",
    message: generated.nextQuestion,
    timestamp: now.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  const response: InterviewChatResponse = {
    status: "ok",
    provider: generated.provider,
    message,
    generatedAt: now.toISOString(),
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

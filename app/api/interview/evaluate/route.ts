import { NextRequest, NextResponse } from "next/server";
import { evaluateInterviewTranscript } from "@/lib/interview/evaluator";
import { saveInterviewEvaluationRecord } from "@/lib/interview/evaluation-repository";
import type {
  EvaluateInterviewRequest,
  EvaluateInterviewResponse,
  InterviewCandidateProfile,
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

export async function POST(request: NextRequest) {
  let body: EvaluateInterviewRequest;

  try {
    body = (await request.json()) as EvaluateInterviewRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const transcript = parseTranscriptInput(body.transcript);

  if (transcript.length === 0) {
    return NextResponse.json(
      {
        error:
          "Transcript is required. Send a non-empty array or JSON string of interview turns.",
      },
      { status: 400 },
    );
  }

  const profile = parseCandidateProfile(body.profile);
  const cvText = typeof body.cvText === "string" ? body.cvText : "";
  const cvEvaluationSummary =
    typeof body.cvEvaluationSummary === "string" ? body.cvEvaluationSummary : "";

  try {
    const result = await evaluateInterviewTranscript(transcript, {
      profile,
      cvText,
      cvEvaluationSummary,
    });

    const savedRecord = await saveInterviewEvaluationRecord({
      provider: result.provider,
      transcript,
      evaluation: result.evaluation,
    });

    const response: EvaluateInterviewResponse = {
      status: "ok",
      evaluationId: savedRecord.id,
      provider: savedRecord.provider,
      evaluation: savedRecord.evaluation,
      rawTranscript: transcript,
      evaluatedAt: savedRecord.createdAt,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Interview evaluation route failed", error);

    return NextResponse.json(
      {
        error:
          "Hệ thống không thể hoàn tất đánh giá phỏng vấn ở thời điểm hiện tại. Vui lòng thử lại sau ít phút.",
      },
      { status: 500 },
    );
  }
}

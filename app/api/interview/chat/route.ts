import { NextRequest, NextResponse } from "next/server";
import { generateInterviewQuestion } from "@/lib/interview/interviewer";
import type {
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
    targetRole: targetRole || "Frontend Engineer",
    cvFileName: cvFileName || "resume.pdf",
    highlights:
      typeof record.highlights === "string" ? record.highlights.trim() : undefined,
  };
}

export async function POST(request: NextRequest) {
  let body: InterviewChatRequest;

  try {
    body = (await request.json()) as InterviewChatRequest;
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
        error: "Transcript is required to generate the next interview question.",
      },
      { status: 400 },
    );
  }

  const language = body.language === "en" ? "en" : "vi";
  const profile = parseCandidateProfile(body.profile);

  const generated = await generateInterviewQuestion(transcript, language, profile);

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

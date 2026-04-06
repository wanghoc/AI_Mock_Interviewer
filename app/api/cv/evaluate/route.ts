import { NextRequest, NextResponse } from "next/server";
import { evaluateCvWithAI } from "@/lib/interview/cv-evaluator";
import type {
  EvaluateCvRequest,
  EvaluateCvResponse,
  InterviewCandidateProfile,
} from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let body: EvaluateCvRequest;

  try {
    body = (await request.json()) as EvaluateCvRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const profile = parseCandidateProfile(body.profile);
  const language = body.language === "en" ? "en" : "vi";
  const cvText = typeof body.cvText === "string" ? body.cvText : "";

  const result = await evaluateCvWithAI(profile, cvText, language);

  const response: EvaluateCvResponse = {
    status: "ok",
    provider: result.provider,
    evaluation: result.evaluation,
    evaluatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export type InterviewTurnRole = "ai" | "user";
export type AIProvider = "openai" | "gemini" | "fallback";

export type InterviewSessionStatus =
  | "IN_PROGRESS"
  | "EVALUATING"
  | "COMPLETED";

export interface InterviewTurn {
  id: string;
  role: InterviewTurnRole;
  message: string;
  timestamp: string;
}

export interface InterviewDetailedReviewItem {
  id: string;
  question: string;
  user_answer: string;
  feedback: string;
  suggested_answer: string;
}

export interface InterviewEvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  detailed_review: InterviewDetailedReviewItem[];
  summary: string;
}

export interface EvaluateInterviewRequest {
  transcript: InterviewTurn[] | string;
  profile?: InterviewCandidateProfile;
  cvText?: string;
  cvEvaluationSummary?: string;
}

export interface EvaluateInterviewResponse {
  status: "ok";
  evaluationId: string;
  provider: AIProvider;
  evaluation: InterviewEvaluationResult;
  rawTranscript: InterviewTurn[];
  evaluatedAt: string;
}

export interface InterviewCandidateProfile {
  candidateName: string;
  targetRole: string;
  cvFileName: string;
  highlights?: string;
}

export interface InterviewChatRequest {
  transcript: InterviewTurn[] | string;
  language?: "vi" | "en";
  profile?: InterviewCandidateProfile;
  cvContext?: string;
}

export interface InterviewChatResponse {
  status: "ok";
  provider: AIProvider;
  message: InterviewTurn;
  generatedAt: string;
}

export interface CvEvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  role_alignment: string[];
  interview_focus: string[];
  summary: string;
}

export interface EvaluateCvRequest {
  profile?: InterviewCandidateProfile;
  cvText?: string;
  language?: "vi" | "en";
}

export interface EvaluateCvResponse {
  status: "ok";
  provider: AIProvider;
  evaluation: CvEvaluationResult;
  evaluatedAt: string;
}

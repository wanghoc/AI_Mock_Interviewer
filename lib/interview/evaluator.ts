import "server-only";

import type {
  InterviewCandidateProfile,
  InterviewDetailedReviewItem,
  InterviewEvaluationResult,
  InterviewTurn,
} from "@/lib/interview/types";

type Provider = "openai" | "gemini" | "fallback";

interface ProviderResult {
  provider: Provider;
  evaluation: InterviewEvaluationResult;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface QuestionAnswerPair {
  id: string;
  question: string;
  userAnswer: string;
}

interface EvaluationContext {
  profile?: InterviewCandidateProfile;
  cvText?: string;
  cvEvaluationSummary?: string;
}

const UNANSWERED_TEXT = "Ung vien chua tra loi cho cau hoi nay.";

function buildSystemPrompt(context: EvaluationContext): string {
  const role = context.profile?.targetRole?.trim() || "vi tri ung tuyen";
  const candidateName = context.profile?.candidateName?.trim() || "ung vien";
  const highlights = context.profile?.highlights?.trim();
  const cvExcerpt = context.cvText?.trim().slice(0, 1400) ?? "";
  const cvEvaluationSummary = context.cvEvaluationSummary?.trim().slice(0, 900) ?? "";

  return [
    `Ban la chuyen gia HR cap cao dang danh gia ${candidateName} cho vai tro ${role}.`,
    "Hay doc lich su phong van va danh gia nang luc ung vien.",
    "Bat buoc can bang giua chat luong cau tra loi, muc do phu hop vai tro, va do khop voi thong tin CV.",
    "Neu cau tra loi khong co du lieu, feedback phai noi ro ly do thay vi suy dien.",
    highlights
      ? `Thong tin noi bat tu profile: ${highlights}`
      : "Neu profile thieu du lieu, hay note ro rang gioi han danh gia.",
    cvExcerpt
      ? `Trich doan CV de tham chieu: ${cvExcerpt}`
      : "Khong co trich doan CV day du, chi danh gia tren transcript va profile.",
    cvEvaluationSummary
      ? `Tom tat danh gia CV truoc do: ${cvEvaluationSummary}`
      : "Chua co tong ket CV truoc do.",
    "Chi duoc tra ve DUY NHAT mot JSON hop le, khong them giai thich.",
    "JSON phai theo dung schema:",
    "{",
    '  "score": number (0-100),',
    '  "strengths": string[],',
    '  "weaknesses": string[],',
    '  "detailed_review": [',
    "    {",
    '      "question": string,',
    '      "user_answer": string,',
    '      "feedback": string,',
    '      "suggested_answer": string',
    "    }",
    "  ],",
    '  "summary": string',
    "}",
  ].join("\n");
}

function buildUserPayload(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): string {
  return JSON.stringify({
    profile: context.profile,
    cv_text_excerpt: context.cvText?.slice(0, 14000) ?? "",
    cv_evaluation_summary: context.cvEvaluationSummary ?? "",
    transcript,
  });
}

function hasAnyUserAnswer(transcript: InterviewTurn[]): boolean {
  return transcript.some(
    (item) => item.role === "user" && item.message.trim().length > 0,
  );
}

function isUnansweredText(input: string): boolean {
  const normalized = input.toLowerCase().trim();

  return (
    normalized.length === 0 ||
    normalized.includes("chua tra loi") ||
    normalized.includes("khong tra loi")
  );
}

function clampScore(rawScore: unknown): number {
  if (typeof rawScore !== "number" || Number.isNaN(rawScore)) {
    return 70;
  }

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function normalizeStringArray(
  value: unknown,
  fallback: string[],
  minLength: number,
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (cleaned.length < minLength) {
    return fallback;
  }

  return cleaned;
}

function stripCodeFence(input: string): string {
  const trimmed = input.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(stripCodeFence(input));
  } catch {
    return null;
  }
}

function extractQuestionAnswerPairs(transcript: InterviewTurn[]): QuestionAnswerPair[] {
  const pairs: QuestionAnswerPair[] = [];

  for (let index = 0; index < transcript.length; index += 1) {
    const turn = transcript[index];

    if (turn.role !== "ai") {
      continue;
    }

    let userAnswer = UNANSWERED_TEXT;

    for (let nextIndex = index + 1; nextIndex < transcript.length; nextIndex += 1) {
      const nextTurn = transcript[nextIndex];

      if (nextTurn.role === "user") {
        userAnswer = nextTurn.message;
        break;
      }

      if (nextTurn.role === "ai") {
        break;
      }
    }

    pairs.push({
      id: `qa-${pairs.length + 1}`,
      question: turn.message,
      userAnswer,
    });
  }

  return pairs;
}

function fallbackDetailedReview(
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): InterviewDetailedReviewItem[] {
  const role = context.profile?.targetRole?.trim() || "vi tri ung tuyen";

  return pairs.map((pair) => ({
    id: pair.id,
    question: pair.question,
    user_answer: pair.userAnswer,
    feedback: isUnansweredText(pair.userAnswer)
      ? "Ung vien chua dua ra cau tra loi cho cau hoi nay, nen chua co du lieu de danh gia nang luc."
      : "Cau tra loi da co y chinh, nhung nen bo sung so lieu cu the, boi canh va ket qua de tang do thuyet phuc.",
    suggested_answer: isUnansweredText(pair.userAnswer)
      ? `Nen tra loi ngan gon theo cau truc Situation -> Action -> Result lien quan den vai tro ${role}.`
      : "Hay tra loi theo cau truc Situation -> Action -> Result va bo sung metric do luong ket qua.",
  }));
}

function normalizeDetailedReview(
  rawValue: unknown,
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): InterviewDetailedReviewItem[] {
  if (!Array.isArray(rawValue)) {
    return fallbackDetailedReview(pairs, context);
  }

  const normalized = rawValue
    .map((item, index): InterviewDetailedReviewItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const entry = item as Record<string, unknown>;
      const pair = pairs[index] ?? pairs[pairs.length - 1];

      const question =
        typeof entry.question === "string" && entry.question.trim().length > 0
          ? entry.question.trim()
          : pair?.question ?? "Cau hoi phong van";

      const userAnswer =
        typeof entry.user_answer === "string" &&
        entry.user_answer.trim().length > 0
          ? entry.user_answer.trim()
          : pair?.userAnswer ?? UNANSWERED_TEXT;

      const feedback =
        typeof entry.feedback === "string" && entry.feedback.trim().length > 0
          ? entry.feedback.trim()
          : "Can bo sung minh chung cu the de tang muc do thuyet phuc.";

      const suggestedAnswer =
        typeof entry.suggested_answer === "string" &&
        entry.suggested_answer.trim().length > 0
          ? entry.suggested_answer.trim()
          : "Hay tra loi theo cau truc ro rang va co so lieu do luong ket qua.";

      if (isUnansweredText(userAnswer)) {
        return {
          id: `review-${index + 1}`,
          question,
          user_answer: UNANSWERED_TEXT,
          feedback:
            "Ung vien chua tra loi cau hoi nay, vi vay chua the phan tich diem manh/yeu cho muc nay.",
          suggested_answer:
            "Can bo sung cau tra loi thuc te voi boi canh, hanh dong va ket qua do luong duoc.",
        };
      }

      return {
        id: `review-${index + 1}`,
        question,
        user_answer: userAnswer,
        feedback,
        suggested_answer: suggestedAnswer,
      };
    })
    .filter((item): item is InterviewDetailedReviewItem => item !== null);

  if (normalized.length === 0) {
    return fallbackDetailedReview(pairs, context);
  }

  return normalized;
}

function createNoAnswerEvaluation(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): InterviewEvaluationResult {
  const role = context.profile?.targetRole?.trim() || "vi tri ung tuyen";
  const pairs = extractQuestionAnswerPairs(transcript);

  return {
    score: 0,
    strengths: [
      "Ung vien chua tra loi cau hoi nao, nen chua co du lieu xac nhan diem manh.",
      `Buoi phong van cho vai tro ${role} can duoc thuc hien lai de thu thap du lieu danh gia.`,
    ],
    weaknesses: [
      "Ung vien chua cung cap cau tra loi, nen khong the danh gia nang luc thuc te.",
      "Chua co du lieu de phan tich kinh nghiem, cach tu duy va ky nang giai quyet van de.",
    ],
    detailed_review: pairs.map((pair, index) => ({
      id: `review-${index + 1}`,
      question: pair.question,
      user_answer: UNANSWERED_TEXT,
      feedback:
        "Ung vien chua tra loi cau hoi nay, nen chua the dua ra nhan xet chuyen mon.",
      suggested_answer:
        "Can tra loi day du de he thong va nha tuyen dung co co so danh gia.",
    })),
    summary:
      "Ung vien chua tra loi trong buoi phong van. He thong khong du du lieu de danh gia nang luc.",
  };
}

function normalizeEvaluation(
  rawValue: unknown,
  transcript: InterviewTurn[],
  context: EvaluationContext,
): InterviewEvaluationResult {
  const pairs = extractQuestionAnswerPairs(transcript);
  const role = context.profile?.targetRole?.trim() || "vi tri ung tuyen";
  const hasCvSignal = Boolean(
    context.profile?.highlights?.trim() ||
      context.cvText?.trim() ||
      context.cvEvaluationSummary?.trim(),
  );

  if (!hasAnyUserAnswer(transcript)) {
    return createNoAnswerEvaluation(transcript, context);
  }

  if (!rawValue || typeof rawValue !== "object") {
    return createFallbackEvaluation(transcript, context);
  }

  const record = rawValue as Record<string, unknown>;

  const strengthsFallback = [
    `Ung vien da co cau tra loi lien quan vai tro ${role}.`,
    "Co the hien duoc kha nang giao tiep va trinh bay y tuong co cau truc.",
    hasCvSignal
      ? "Noi dung tra loi co mot phan lien ket voi thong tin trong CV/profile."
      : "Ung vien da tham gia trao doi va the hien thai do hop tac.",
  ];

  const weaknessesFallback = [
    "Can them vi du thuc te co metric de tang tinh thuyet phuc.",
    "Nen tra loi co cau truc on dinh va ngan gon hon.",
    hasCvSignal
      ? "Can lien ket ro hon giua kinh nghiem trong CV va cau tra loi phong van."
      : "Can dao sau hon ve trade-off ky thuat khi dua ra giai phap.",
  ];

  const summaryFallback =
    `Ung vien co tiem nang cho vai tro ${role}, can cai thien cach dien dat co metric va lien ket ro hon voi kinh nghiem da neu.`;

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, strengthsFallback, 2),
    weaknesses: normalizeStringArray(record.weaknesses, weaknessesFallback, 2),
    detailed_review: normalizeDetailedReview(record.detailed_review, pairs, context),
    summary:
      typeof record.summary === "string" && record.summary.trim().length > 0
        ? record.summary.trim()
        : summaryFallback,
  };
}

function createFallbackEvaluation(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): InterviewEvaluationResult {
  if (!hasAnyUserAnswer(transcript)) {
    return createNoAnswerEvaluation(transcript, context);
  }

  const role = context.profile?.targetRole?.trim() || "vi tri ung tuyen";
  const userAnswers = transcript.filter((item) => item.role === "user");
  const answerCount = userAnswers.length;
  const averageLength =
    answerCount > 0
      ? Math.round(
          userAnswers.reduce((sum, item) => sum + item.message.length, 0) /
            answerCount,
        )
      : 0;

  const score = Math.max(
    55,
    Math.min(92, Math.round(62 + averageLength / 10 + answerCount * 2)),
  );

  const detailedReview = fallbackDetailedReview(
    extractQuestionAnswerPairs(transcript),
    context,
  );

  return {
    score,
    strengths: [
      "Ung vien da tham gia luong hoi dap va bam sat chu de phong van.",
      `Co the hien duoc kinh nghiem lien quan den vai tro ${role}.`,
      "Giong van phong va thai do tra loi mang tinh hop tac.",
    ],
    weaknesses: [
      "Can bo sung so lieu ket qua de tang do tin cay cho tung vi du.",
      "Can dao sau hon vao trade-off va cach ra quyet dinh ky thuat.",
      "Nen ket thuc cau tra loi bang bai hoc hoac tac dong kinh doanh ro rang hon.",
    ],
    detailed_review: detailedReview,
    summary:
      "He thong da tao ban danh gia tam thoi do chua cau hinh API AI. Ban co the them OPENAI_API_KEY hoac GEMINI_API_KEY de nhan nhan xet sau hon.",
  };
}

async function callOpenAI(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): Promise<ProviderResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(context),
        },
        {
          role: "user",
          content: buildUserPayload(transcript, context),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  const parsed = safeJsonParse(content);
  return {
    provider: "openai",
    evaluation: normalizeEvaluation(parsed, transcript, context),
  };
}

async function callGemini(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): Promise<ProviderResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = Array.from(
    new Set(
      [
        configuredModel,
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-flash-latest",
      ].filter((item): item is string => Boolean(item)),
    ),
  );

  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt(context) }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPayload(transcript, context) }],
          },
        ],
      }),
    });

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${response.status}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (!content) {
      throw new Error("Gemini returned empty content.");
    }

    const parsed = safeJsonParse(content);

    return {
      provider: "gemini",
      evaluation: normalizeEvaluation(parsed, transcript, context),
    };
  }

  return null;
}

export async function evaluateInterviewTranscript(
  transcript: InterviewTurn[],
  context: EvaluationContext = {},
): Promise<ProviderResult> {
  if (!hasAnyUserAnswer(transcript)) {
    return {
      provider: "fallback",
      evaluation: createNoAnswerEvaluation(transcript, context),
    };
  }

  try {
    const openAIResult = await callOpenAI(transcript, context);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.error("OpenAI evaluation failed", error);
  }

  try {
    const geminiResult = await callGemini(transcript, context);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.error("Gemini evaluation failed", error);
  }

  return {
    provider: "fallback",
    evaluation: createFallbackEvaluation(transcript, context),
  };
}

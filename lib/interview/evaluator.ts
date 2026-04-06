import "server-only";

import type {
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

const SYSTEM_PROMPT = [
  "Ban la mot chuyen gia HR cap cao.",
  "Hay doc lich su phong van va danh gia nang luc ung vien.",
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
  "Danh gia can cu the, can bang va mang tinh huan luyen.",
].join("\n");

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

    let userAnswer = "Ung vien chua tra loi cho cau hoi nay.";

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
): InterviewDetailedReviewItem[] {
  return pairs.map((pair) => ({
    id: pair.id,
    question: pair.question,
    user_answer: pair.userAnswer,
    feedback:
      "Cau tra loi da the hien duoc y chinh, nhung nen bo sung them so lieu cu the, boi canh va ket qua de tang do thuyet phuc.",
    suggested_answer:
      "Hay tra loi theo cau truc Situation -> Action -> Result. Neu co the, them metric cu the (vi du: giam thoi gian tai trang, tang conversion, giam bug).",
  }));
}

function normalizeDetailedReview(
  rawValue: unknown,
  pairs: QuestionAnswerPair[],
): InterviewDetailedReviewItem[] {
  if (!Array.isArray(rawValue)) {
    return fallbackDetailedReview(pairs);
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
          : pair?.userAnswer ?? "Ung vien chua tra loi.";

      const feedback =
        typeof entry.feedback === "string" && entry.feedback.trim().length > 0
          ? entry.feedback.trim()
          : "Can bo sung minh chung cu the de tang muc do thuyet phuc.";

      const suggestedAnswer =
        typeof entry.suggested_answer === "string" &&
        entry.suggested_answer.trim().length > 0
          ? entry.suggested_answer.trim()
          : "Hay tra loi theo cau truc ro rang va co so lieu do luong ket qua.";

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
    return fallbackDetailedReview(pairs);
  }

  return normalized;
}

function normalizeEvaluation(
  rawValue: unknown,
  transcript: InterviewTurn[],
): InterviewEvaluationResult {
  const pairs = extractQuestionAnswerPairs(transcript);

  if (!rawValue || typeof rawValue !== "object") {
    return createFallbackEvaluation(transcript);
  }

  const record = rawValue as Record<string, unknown>;

  const strengthsFallback = [
    "Co the hien duoc kha nang giao tiep va trinh bay y tuong mach lac.",
    "Tra loi dung trong tam cho mot so cau hoi ky thuat chinh.",
    "The hien thai do hop tac va san sang hoc hoi.",
  ];

  const weaknessesFallback = [
    "Can them vi du thuc te co metric de tang tinh thuyet phuc.",
    "Nen tra loi co cau truc on dinh va ngan gon hon.",
    "Can dao sau hon ve trade-off ky thuat khi dua ra giai phap.",
  ];

  const summaryFallback =
    "Ung vien co tiem nang va nen tiep tuc cai thien cach dien dat theo huong co cau truc, co metric va co bai hoc rut ra.";

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, strengthsFallback, 2),
    weaknesses: normalizeStringArray(record.weaknesses, weaknessesFallback, 2),
    detailed_review: normalizeDetailedReview(record.detailed_review, pairs),
    summary:
      typeof record.summary === "string" && record.summary.trim().length > 0
        ? record.summary.trim()
        : summaryFallback,
  };
}

function createFallbackEvaluation(transcript: InterviewTurn[]): InterviewEvaluationResult {
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
  );

  return {
    score,
    strengths: [
      "Ung vien da tham gia day du luong hoi dap va bam sat chu de.",
      "Co the hien duoc kinh nghiem lien quan den vi tri dang ung tuyen.",
      "Giong van phong va thai do tra loi mang tinh hop tac.",
    ],
    weaknesses: [
      "Can bo sung so lieu ket qua de tang do tin cay cho tung vi du.",
      "Can dao sau hon vao trade-off va cach ra quyet dinh ky thuat.",
      "Nen ket thuc cau tra loi bang bai hoc hoac tac dong kinh doanh ro rang.",
    ],
    detailed_review: detailedReview,
    summary:
      "He thong da tao ban danh gia tam thoi do chua cau hinh API AI. Ban co the them OPENAI_API_KEY hoac GEMINI_API_KEY de nhan nhan xet sau hon.",
  };
}

async function callOpenAI(transcript: InterviewTurn[]): Promise<ProviderResult | null> {
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
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({ transcript }),
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
    evaluation: normalizeEvaluation(parsed, transcript),
  };
}

async function callGemini(transcript: InterviewTurn[]): Promise<ProviderResult | null> {
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
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify({ transcript }) }],
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
      evaluation: normalizeEvaluation(parsed, transcript),
    };
  }

  return null;
}

export async function evaluateInterviewTranscript(
  transcript: InterviewTurn[],
): Promise<ProviderResult> {
  try {
    const openAIResult = await callOpenAI(transcript);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.error("OpenAI evaluation failed", error);
  }

  try {
    const geminiResult = await callGemini(transcript);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.error("Gemini evaluation failed", error);
  }

  return {
    provider: "fallback",
    evaluation: createFallbackEvaluation(transcript),
  };
}

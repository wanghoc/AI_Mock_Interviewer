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

const UNANSWERED_TEXT = "Ứng viên chưa trả lời cho câu hỏi này.";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
}

function buildSystemPrompt(context: EvaluationContext): string {
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const candidateName = context.profile?.candidateName?.trim() || "ứng viên";
  const highlights = context.profile?.highlights?.trim();
  const cvExcerpt = context.cvText?.trim().slice(0, 1400) ?? "";
  const cvEvaluationSummary = context.cvEvaluationSummary?.trim().slice(0, 900) ?? "";

  return [
    `Bạn là chuyên gia HR cấp cao đang đánh giá ${candidateName} cho vai trò ${role}.`,
    "Hãy đọc lịch sử phỏng vấn và đánh giá năng lực ứng viên.",
    "Bắt buộc cân bằng giữa chất lượng câu trả lời, mức độ phù hợp vai trò, và độ khớp với thông tin CV.",
    "Nếu câu trả lời không có dữ liệu, feedback phải nói rõ lý do thay vì suy diễn.",
    "Bắt buộc viết toàn bộ nhận xét bằng tiếng Việt có dấu, mạch lạc, chuyên nghiệp.",
    highlights
      ? `Thông tin nổi bật từ profile: ${highlights}`
      : "Nếu profile thiếu dữ liệu, hãy nêu rõ giới hạn đánh giá.",
    cvExcerpt
      ? `Trích đoạn CV để tham chiếu: ${cvExcerpt}`
      : "Không có trích đoạn CV đầy đủ, chỉ đánh giá trên transcript và profile.",
    cvEvaluationSummary
      ? `Tóm tắt đánh giá CV trước đó: ${cvEvaluationSummary}`
      : "Chưa có tổng kết CV trước đó.",
    "Chỉ được trả về DUY NHẤT một JSON hợp lệ, không thêm giải thích.",
    "JSON phải theo đúng schema:",
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
    normalized.includes("chưa trả lời") ||
    normalized.includes("không trả lời") ||
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
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";

  return pairs.map((pair) => ({
    id: pair.id,
    question: pair.question,
    user_answer: pair.userAnswer,
    feedback: isUnansweredText(pair.userAnswer)
      ? "Ứng viên chưa đưa ra câu trả lời cho câu hỏi này, nên chưa có dữ liệu để đánh giá năng lực."
      : "Câu trả lời đã có ý chính, nhưng nên bổ sung số liệu cụ thể, bối cảnh và kết quả để tăng độ thuyết phục.",
    suggested_answer: isUnansweredText(pair.userAnswer)
      ? `Nên trả lời ngắn gọn theo cấu trúc Situation -> Action -> Result liên quan đến vai trò ${role}.`
      : "Hãy trả lời theo cấu trúc Situation -> Action -> Result và bổ sung metric đo lường kết quả.",
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
          : pair?.question ?? "Câu hỏi phỏng vấn";

      const userAnswer =
        typeof entry.user_answer === "string" &&
        entry.user_answer.trim().length > 0
          ? entry.user_answer.trim()
          : pair?.userAnswer ?? UNANSWERED_TEXT;

      const feedback =
        typeof entry.feedback === "string" && entry.feedback.trim().length > 0
          ? entry.feedback.trim()
          : "Cần bổ sung minh chứng cụ thể để tăng mức độ thuyết phục.";

      const suggestedAnswer =
        typeof entry.suggested_answer === "string" &&
        entry.suggested_answer.trim().length > 0
          ? entry.suggested_answer.trim()
          : "Hãy trả lời theo cấu trúc rõ ràng và có số liệu đo lường kết quả.";

      if (isUnansweredText(userAnswer)) {
        return {
          id: `review-${index + 1}`,
          question,
          user_answer: UNANSWERED_TEXT,
          feedback:
            "Ứng viên chưa trả lời câu hỏi này, vì vậy chưa thể phân tích điểm mạnh/yếu cho mục này.",
          suggested_answer:
            "Cần bổ sung câu trả lời thực tế với bối cảnh, hành động và kết quả đo lường được.",
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
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const pairs = extractQuestionAnswerPairs(transcript);

  return {
    score: 0,
    strengths: [
      "Ứng viên chưa trả lời câu hỏi nào, nên chưa có dữ liệu xác nhận điểm mạnh.",
      `Buổi phỏng vấn cho vai trò ${role} cần được thực hiện lại để thu thập dữ liệu đánh giá.`,
    ],
    weaknesses: [
      "Ứng viên chưa cung cấp câu trả lời, nên không thể đánh giá năng lực thực tế.",
      "Chưa có dữ liệu để phân tích kinh nghiệm, cách tư duy và kỹ năng giải quyết vấn đề.",
    ],
    detailed_review: pairs.map((pair, index) => ({
      id: `review-${index + 1}`,
      question: pair.question,
      user_answer: UNANSWERED_TEXT,
      feedback:
        "Ứng viên chưa trả lời câu hỏi này, nên chưa thể đưa ra nhận xét chuyên môn.",
      suggested_answer:
        "Cần trả lời đầy đủ để hệ thống và nhà tuyển dụng có cơ sở đánh giá.",
    })),
    summary:
      "Ứng viên chưa trả lời trong buổi phỏng vấn. Hệ thống không đủ dữ liệu để đánh giá năng lực.",
  };
}

function normalizeEvaluation(
  rawValue: unknown,
  transcript: InterviewTurn[],
  context: EvaluationContext,
): InterviewEvaluationResult {
  const pairs = extractQuestionAnswerPairs(transcript);
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
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
    `Ứng viên đã có câu trả lời liên quan vai trò ${role}.`,
    "Có thể hiện được khả năng giao tiếp và trình bày ý tưởng có cấu trúc.",
    hasCvSignal
      ? "Nội dung trả lời có một phần liên kết với thông tin trong CV/profile."
      : "Ứng viên đã tham gia trao đổi và thể hiện thái độ hợp tác.",
  ];

  const weaknessesFallback = [
    "Cần thêm ví dụ thực tế có metric để tăng tính thuyết phục.",
    "Nên trả lời có cấu trúc ổn định và ngắn gọn hơn.",
    hasCvSignal
      ? "Cần liên kết rõ hơn giữa kinh nghiệm trong CV và câu trả lời phỏng vấn."
      : "Cần đào sâu hơn về trade-off kỹ thuật khi đưa ra giải pháp.",
  ];

  const summaryFallback =
    `Ứng viên có tiềm năng cho vai trò ${role}, cần cải thiện cách diễn đạt có metric và liên kết rõ hơn với kinh nghiệm đã nêu.`;

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

  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
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
      "Ứng viên đã tham gia luồng hỏi đáp và bám sát chủ đề phỏng vấn.",
      `Có thể hiện được kinh nghiệm liên quan đến vai trò ${role}.`,
      "Giọng văn phong và thái độ trả lời mang tính hợp tác.",
    ],
    weaknesses: [
      "Cần bổ sung số liệu kết quả để tăng độ tin cậy cho từng ví dụ.",
      "Cần đào sâu hơn vào trade-off và cách ra quyết định kỹ thuật.",
      "Nên kết thúc câu trả lời bằng bài học hoặc tác động kinh doanh rõ ràng hơn.",
    ],
    detailed_review: detailedReview,
    summary:
      "Hệ thống đã tạo bản đánh giá tạm thời do chưa cấu hình API AI. Bạn có thể thêm OPENAI_API_KEY hoặc GEMINI_API_KEY để nhận nhận xét sâu hơn.",
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
    return null;
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return null;
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
      continue;
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (!content) {
      continue;
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
    console.warn("OpenAI evaluation unavailable, switching provider.", {
      reason: toErrorMessage(error),
    });
  }

  try {
    const geminiResult = await callGemini(transcript, context);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.warn("Gemini evaluation unavailable, using fallback.", {
      reason: toErrorMessage(error),
    });
  }

  return {
    provider: "fallback",
    evaluation: createFallbackEvaluation(transcript, context),
  };
}

import "server-only";

import type {
  AIProvider,
  CvEvaluationResult,
  InterviewCandidateProfile,
} from "@/lib/interview/types";

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

interface CvEvaluationProviderResult {
  provider: AIProvider;
  evaluation: CvEvaluationResult;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
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

function clampScore(rawScore: unknown): number {
  if (typeof rawScore !== "number" || Number.isNaN(rawScore)) {
    return 55;
  }

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function normalizeStringArray(
  input: unknown,
  fallback: string[],
  minItems: number,
): string[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized = input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length < minItems) {
    return fallback;
  }

  return normalized;
}

function buildSystemPrompt(language: "vi" | "en"): string {
  if (language === "vi") {
    return [
      "Bạn là chuyên gia tuyển dụng cấp cao chuyên đánh giá CV kỹ thuật.",
      "Hãy đánh giá hồ sơ dựa trên profile ứng viên và nội dung CV (nếu có).",
      "Bắt buộc viết toàn bộ nhận xét bằng tiếng Việt có dấu, rõ ràng, chuyên nghiệp.",
      "Trả về DUY NHẤT JSON hợp lệ với đúng schema sau:",
      "{",
      '  "score": number (0-100),',
      '  "strengths": string[],',
      '  "weaknesses": string[],',
      '  "role_alignment": string[],',
      '  "interview_focus": string[],',
      '  "summary": string',
      "}",
      "Đánh giá phải thực tế, cân bằng, và có thể hành động được.",
    ].join("\n");
  }

  return [
    "You are a senior hiring specialist evaluating technical CVs.",
    "Evaluate based on candidate profile and CV text when available.",
    "Return ONLY valid JSON with schema:",
    "{",
    '  "score": number (0-100),',
    '  "strengths": string[],',
    '  "weaknesses": string[],',
    '  "role_alignment": string[],',
    '  "interview_focus": string[],',
    '  "summary": string',
    "}",
  ].join("\n");
}

function buildUserPayload(
  profile: InterviewCandidateProfile | undefined,
  cvText: string,
  language: "vi" | "en",
) {
  return JSON.stringify({
    language,
    profile,
    cv_text_excerpt: cvText.slice(0, 14000),
  });
}

function normalizeEvaluation(
  raw: unknown,
  profile?: InterviewCandidateProfile,
): CvEvaluationResult {
  const role = profile?.targetRole || "vị trí ứng tuyển";

  const strengthsFallback = [
    "CV có cấu trúc rõ ràng và đủ thông tin nền tảng để đánh giá bước đầu.",
    "Ứng viên thể hiện định hướng nghề nghiệp phù hợp với vai trò đang ứng tuyển.",
    "Hồ sơ thể hiện tiềm năng phát triển nếu được đào sâu thêm ở vòng phỏng vấn.",
  ];

  const weaknessesFallback = [
    "Nên bổ sung số liệu định lượng cho các thành tựu để tăng độ thuyết phục.",
    "Cần nêu rõ hơn phạm vi trách nhiệm cá nhân trong từng dự án lớn.",
    "Một số kỹ năng chuyên sâu liên quan trực tiếp vị trí ứng tuyển chưa được thể hiện rõ.",
  ];

  const alignmentFallback = [
    `Mức độ phù hợp tổng thể với ${role} ở mức khá, cần xác thực thêm qua phỏng vấn kỹ thuật.`,
    "Có nền tảng phù hợp cho vòng interview nếu bổ sung thêm bối cảnh dự án thực tế.",
  ];

  const focusFallback = [
    "Đào sâu vào dự án có tác động lớn nhất và vai trò thực tế của ứng viên.",
    "Kiểm tra kỹ năng giải quyết vấn đề và trade-off kỹ thuật trong tình huống thực tế.",
    "Xác thực kinh nghiệm làm việc nhóm, ownership và khả năng giao tiếp kỹ thuật.",
  ];

  const summaryFallback =
    "Hồ sơ có tiềm năng nhưng cần bổ sung thêm các minh chứng định lượng và chiều sâu kỹ thuật để tăng độ cạnh tranh.";

  if (!raw || typeof raw !== "object") {
    return {
      score: 62,
      strengths: strengthsFallback,
      weaknesses: weaknessesFallback,
      role_alignment: alignmentFallback,
      interview_focus: focusFallback,
      summary: summaryFallback,
    };
  }

  const record = raw as Record<string, unknown>;

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, strengthsFallback, 2),
    weaknesses: normalizeStringArray(record.weaknesses, weaknessesFallback, 2),
    role_alignment: normalizeStringArray(record.role_alignment, alignmentFallback, 1),
    interview_focus: normalizeStringArray(record.interview_focus, focusFallback, 2),
    summary:
      typeof record.summary === "string" && record.summary.trim().length > 0
        ? record.summary.trim()
        : summaryFallback,
  };
}

function createNoDataEvaluation(
  profile?: InterviewCandidateProfile,
): CvEvaluationResult {
  const role = profile?.targetRole || "vị trí ứng tuyển";

  return {
    score: 25,
    strengths: [
      "Ứng viên đã cung cấp thông tin hồ sơ cơ bản để khởi tạo đánh giá.",
      "Có định hướng nghề nghiệp ban đầu cho vị trí mục tiêu.",
    ],
    weaknesses: [
      "Chưa trích xuất được nội dung CV nên chưa thể đánh giá chính xác năng lực thực tế.",
      "Thiếu dữ liệu dự án, kỹ năng, thành tựu để đối chiếu với yêu cầu công việc.",
    ],
    role_alignment: [
      `Hiện chưa đủ dữ liệu để kết luận mức phù hợp với ${role}.`,
    ],
    interview_focus: [
      "Yêu cầu ứng viên trình bày chi tiết dự án thực tế đã làm.",
      "Xác thực kỹ năng cốt lõi và mức độ ownership qua câu hỏi tình huống.",
    ],
    summary:
      "Hệ thống chưa có đủ dữ liệu CV để đánh giá đầy đủ. Vui lòng kiểm tra lại file hoặc bổ sung thông tin hồ sơ chi tiết hơn.",
  };
}

function getGeminiModels(): string[] {
  const configuredModel = process.env.GEMINI_MODEL?.trim();

  return Array.from(
    new Set(
      [
        configuredModel,
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-flash-latest",
      ].filter((item): item is string => Boolean(item)),
    ),
  );
}

async function callOpenAI(
  profile: InterviewCandidateProfile | undefined,
  cvText: string,
  language: "vi" | "en",
): Promise<CvEvaluationProviderResult | null> {
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
          content: buildSystemPrompt(language),
        },
        {
          role: "user",
          content: buildUserPayload(profile, cvText, language),
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

  return {
    provider: "openai",
    evaluation: normalizeEvaluation(safeJsonParse(content), profile),
  };
}

async function callGemini(
  profile: InterviewCandidateProfile | undefined,
  cvText: string,
  language: "vi" | "en",
): Promise<CvEvaluationProviderResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const models = getGeminiModels();

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt(language) }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildUserPayload(profile, cvText, language),
              },
            ],
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

    return {
      provider: "gemini",
      evaluation: normalizeEvaluation(safeJsonParse(content), profile),
    };
  }

  return null;
}

export async function evaluateCvWithAI(
  profile: InterviewCandidateProfile | undefined,
  cvText: string,
  language: "vi" | "en" = "vi",
): Promise<CvEvaluationProviderResult> {
  const normalizedCvText = cvText.trim();

  if (!normalizedCvText && !profile?.highlights) {
    return {
      provider: "fallback",
      evaluation: createNoDataEvaluation(profile),
    };
  }

  try {
    const openAIResult = await callOpenAI(profile, normalizedCvText, language);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.warn("OpenAI CV evaluation unavailable, switching provider.", {
      reason: toErrorMessage(error),
    });
  }

  try {
    const geminiResult = await callGemini(profile, normalizedCvText, language);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.warn("Gemini CV evaluation unavailable, using fallback.", {
      reason: toErrorMessage(error),
    });
  }

  return {
    provider: "fallback",
    evaluation: normalizeEvaluation(null, profile),
  };
}

import "server-only";

import type {
  AIProvider,
  InterviewCandidateProfile,
  InterviewTurn,
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

interface InterviewerResult {
  provider: AIProvider;
  nextQuestion: string;
}

const FALLBACK_QUESTIONS_VI = [
  "Bạn đã từng xử lý một sự cố production nào nghiêm trọng nhất và cách bạn phối hợp với team ra sao?",
  "Khi phải trade-off giữa tốc độ phát triển và chất lượng code, bạn thường đưa ra quyết định như thế nào?",
  "Nếu cần cải thiện Core Web Vitals cho một trang có traffic lớn, bạn sẽ bắt đầu từ đâu?",
  "Bạn hãy kể một ví dụ về việc bạn phản biện yêu cầu sản phẩm và đề xuất giải pháp tốt hơn.",
  "Trong 90 ngày đầu nếu nhận việc, bạn sẽ ưu tiên những mục tiêu kỹ thuật nào?",
];

const FALLBACK_QUESTIONS_EN = [
  "Tell me about the most critical production incident you handled and how you coordinated with your team.",
  "How do you decide when there is a trade-off between delivery speed and code quality?",
  "If you had to improve Core Web Vitals for a high-traffic page, where would you start?",
  "Give me an example of when you challenged a product requirement and proposed a better alternative.",
  "In your first 90 days, what technical priorities would you focus on?",
];

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

function normalizeQuestion(rawValue: unknown, language: "vi" | "en"): string {
  if (rawValue && typeof rawValue === "object") {
    const record = rawValue as Record<string, unknown>;
    const nextQuestion = record.next_question;

    if (typeof nextQuestion === "string" && nextQuestion.trim().length > 0) {
      return nextQuestion.trim();
    }
  }

  if (language === "vi") {
    return "Bạn hãy chia sẻ thêm một ví dụ thực tế gần đây nhất để làm rõ phong cách làm việc của bạn.";
  }

  return "Please share one more recent real-world example to clarify your working style.";
}

function buildSystemPrompt(language: "vi" | "en"): string {
  if (language === "vi") {
    return [
      "Bạn là một Senior Technical Interviewer chuyên phỏng vấn Frontend Engineer.",
      "Nhiệm vụ: dựa trên lịch sử hội thoại, đặt đúng 1 câu hỏi tiếp theo.",
      "Không trả lời dài dòng, không chấm điểm ở bước này.",
      "Mức độ chuyên nghiệp, ngắn gọn, sắc bén.",
      "BẮT BUỘC trả về JSON hợp lệ duy nhất:",
      '{ "next_question": "..." }',
      "Câu hỏi mới không được trùng hệt câu trước.",
      "Nếu ứng viên trả lời mơ hồ, hãy đặt câu hỏi đào sâu có ví dụ/metric.",
    ].join("\n");
  }

  return [
    "You are a senior technical interviewer for frontend roles.",
    "Based on the transcript, ask exactly one next interview question.",
    "Be concise and professional.",
    "Return only valid JSON:",
    '{ "next_question": "..." }',
    "Avoid repeating the exact same question.",
  ].join("\n");
}

function buildUserContent(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
) {
  return JSON.stringify({
    language,
    profile,
    transcript,
  });
}

function getFallbackQuestion(
  transcript: InterviewTurn[],
  language: "vi" | "en",
): string {
  const aiCount = transcript.filter((item) => item.role === "ai").length;
  const pool = language === "vi" ? FALLBACK_QUESTIONS_VI : FALLBACK_QUESTIONS_EN;
  return pool[aiCount % pool.length];
}

async function callOpenAI(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
): Promise<InterviewerResult | null> {
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
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(language),
        },
        {
          role: "user",
          content: buildUserContent(transcript, language, profile),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI chat request failed: ${response.status}`);
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI chat returned empty content.");
  }

  const parsed = safeJsonParse(content);

  return {
    provider: "openai",
    nextQuestion: normalizeQuestion(parsed, language),
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

async function callGemini(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
): Promise<InterviewerResult | null> {
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
          temperature: 0.3,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildUserContent(transcript, language, profile),
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
      throw new Error(`Gemini chat request failed: ${response.status}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (!content) {
      throw new Error("Gemini chat returned empty content.");
    }

    const parsed = safeJsonParse(content);

    return {
      provider: "gemini",
      nextQuestion: normalizeQuestion(parsed, language),
    };
  }

  return null;
}

export async function generateInterviewQuestion(
  transcript: InterviewTurn[],
  language: "vi" | "en" = "vi",
  profile?: InterviewCandidateProfile,
): Promise<InterviewerResult> {
  try {
    const openAIResult = await callOpenAI(transcript, language, profile);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.error("OpenAI interviewer failed", error);
  }

  try {
    const geminiResult = await callGemini(transcript, language, profile);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.error("Gemini interviewer failed", error);
  }

  return {
    provider: "fallback",
    nextQuestion: getFallbackQuestion(transcript, language),
  };
}

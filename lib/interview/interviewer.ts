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
    return "Bạn hãy chia sẻ một ví dụ thực tế gần đây để làm rõ phong cách làm việc và kết quả bạn tạo ra.";
  }

  return "Please share a recent real-world example that shows your working style and impact.";
}

function buildSystemPrompt(
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
): string {
  const role = profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const candidateName = profile?.candidateName?.trim() || "ứng viên";
  const highlights = profile?.highlights?.trim();
  const cvHint = cvContext?.trim().slice(0, 1200) ?? "";

  if (language === "vi") {
    return [
      `Bạn là Senior Technical Interviewer đang phỏng vấn ${candidateName} cho vị trí ${role}.`,
      "Nhiệm vụ: dựa trên lịch sử hội thoại để đặt đúng 1 câu hỏi tiếp theo, ngắn gọn và sắc bén.",
      "Bắt buộc cân bằng nội dung:",
      "- Khoảng 30-40% câu hỏi khai thác CV hoặc thành tựu đã nêu.",
      "- Phần còn lại là câu hỏi tình huống/chuyên môn theo đúng vị trí ứng tuyển.",
      "- Nếu ứng viên trả lời chung chung, phải hỏi đào sâu bằng ví dụ/metric.",
      highlights
        ? `Thông tin nổi bật từ CV/profile: ${highlights}`
        : "Nếu thiếu thông tin CV, hãy đặt câu hỏi để bổ sung dữ kiện thực tế.",
      cvHint
        ? `Trích đoạn CV để tham chiếu (không cần nhắc lại nguyên văn): ${cvHint}`
        : "Không có trích đoạn CV đầy đủ, chỉ dùng profile và transcript hiện có.",
      "Trả về DUY NHẤT JSON hợp lệ:",
      '{ "next_question": "..." }',
      "Không trả lời thêm mô tả, không markdown, không code block.",
    ].join("\n");
  }

  return [
    `You are a senior technical interviewer interviewing ${candidateName} for ${role}.`,
    "Ask exactly one concise next question based on transcript context.",
    "Balance questions: 30-40% CV-driven probes, remaining role-specific technical/situational probes.",
    "If the answer is vague, ask for concrete examples and measurable outcomes.",
    "Return ONLY valid JSON:",
    '{ "next_question": "..." }',
  ].join("\n");
}

function buildUserContent(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
) {
  return JSON.stringify({
    language,
    profile,
    cv_context_excerpt: cvContext?.slice(0, 14000) ?? "",
    transcript,
  });
}

function getRoleAwareFallbackQuestion(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
): string {
  const role = profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const hasCvContext = Boolean(cvContext?.trim() || profile?.highlights?.trim());
  const aiCount = transcript.filter((item) => item.role === "ai").length;

  if (language === "en") {
    if (hasCvContext && aiCount % 3 === 0) {
      return `Based on your CV, which project best demonstrates your fit for the ${role} role, and what measurable impact did you deliver?`;
    }

    return `For the ${role} role, describe a difficult technical decision you made and how you validated the outcome.`;
  }

  if (hasCvContext && aiCount % 3 === 0) {
    return `Dựa trên CV của bạn, dự án nào thể hiện rõ nhất sự phù hợp với vị trí ${role}, và kết quả định lượng bạn đạt được là gì?`;
  }

  return `Với vị trí ${role}, bạn hãy mô tả một quyết định kỹ thuật khó mà bạn từng đưa ra và cách bạn kiểm chứng hiệu quả của quyết định đó.`;
}

async function callOpenAI(
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
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
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(language, profile, cvContext),
        },
        {
          role: "user",
          content: buildUserContent(transcript, language, profile, cvContext),
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

  return {
    provider: "openai",
    nextQuestion: normalizeQuestion(safeJsonParse(content), language),
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
  cvContext?: string,
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
          parts: [{ text: buildSystemPrompt(language, profile, cvContext) }],
        },
        generationConfig: {
          temperature: 0.35,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildUserContent(transcript, language, profile, cvContext),
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

    return {
      provider: "gemini",
      nextQuestion: normalizeQuestion(safeJsonParse(content), language),
    };
  }

  return null;
}

export async function generateInterviewQuestion(
  transcript: InterviewTurn[],
  language: "vi" | "en" = "vi",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
): Promise<InterviewerResult> {
  try {
    const openAIResult = await callOpenAI(transcript, language, profile, cvContext);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.error("OpenAI interviewer failed", error);
  }

  try {
    const geminiResult = await callGemini(transcript, language, profile, cvContext);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.error("Gemini interviewer failed", error);
  }

  return {
    provider: "fallback",
    nextQuestion: getRoleAwareFallbackQuestion(
      transcript,
      language,
      profile,
      cvContext,
    ),
  };
}

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

function normalizeForComparison(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(input: string): Set<string> {
  return new Set(
    input
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

function questionSimilarityScore(a: string, b: string): number {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  if (
    normalizedA.length >= 24 &&
    normalizedB.length >= 24 &&
    (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))
  ) {
    return 0.92;
  }

  const setA = tokenSet(normalizedA);
  const setB = tokenSet(normalizedB);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersectionCount = 0;

  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  if (unionCount <= 0) {
    return 0;
  }

  return intersectionCount / unionCount;
}

function isQuestionTooSimilar(candidate: string, existing: string): boolean {
  return questionSimilarityScore(candidate, existing) >= 0.7;
}

function getRecentAiQuestions(transcript: InterviewTurn[], limit = 8): string[] {
  return transcript
    .filter((turn) => turn.role === "ai")
    .slice(-limit)
    .map((turn) => turn.message);
}

function getLatestUserAnswerExcerpt(transcript: InterviewTurn[]): string | null {
  const latestUserTurn = [...transcript]
    .reverse()
    .find((turn) => turn.role === "user" && turn.message.trim().length > 0);

  if (!latestUserTurn) {
    return null;
  }

  const cleaned = latestUserTurn.message
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (cleaned.length < 20) {
    return null;
  }

  if (cleaned.length <= 96) {
    return cleaned;
  }

  return `${cleaned.slice(0, 93)}...`;
}

function pickFreshQuestion(
  candidates: string[],
  transcript: InterviewTurn[],
  language: "vi" | "en",
): string {
  const recentQuestions = getRecentAiQuestions(transcript);

  for (const candidate of candidates) {
    const trimmedCandidate = candidate.trim();
    if (!trimmedCandidate) {
      continue;
    }

    const isDuplicate = recentQuestions.some((question) =>
      isQuestionTooSimilar(trimmedCandidate, question),
    );

    if (!isDuplicate) {
      return trimmedCandidate;
    }
  }

  const fallback = candidates[0]?.trim();
  if (fallback) {
    return language === "vi"
      ? `${fallback} Hãy đi sâu vào bối cảnh, hành động và kết quả định lượng.`
      : `${fallback} Please include context, actions, and measurable outcomes.`;
  }

  return language === "vi"
    ? "Bạn hãy chia sẻ một ví dụ cụ thể gần đây và kết quả định lượng bạn đạt được."
    : "Please share a recent concrete example and measurable outcomes.";
}

function ensureDistinctQuestion(
  question: string,
  transcript: InterviewTurn[],
  language: "vi" | "en",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
): string {
  const candidate = question.trim();
  if (!candidate) {
    return getRoleAwareFallbackQuestion(transcript, language, profile, cvContext);
  }

  const isDuplicate = getRecentAiQuestions(transcript).some((existing) =>
    isQuestionTooSimilar(candidate, existing),
  );

  if (!isDuplicate) {
    return candidate;
  }

  return getRoleAwareFallbackQuestion(transcript, language, profile, cvContext);
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
      "Tuyệt đối không lặp lại câu hỏi đã xuất hiện trong transcript, kể cả khi chỉ thay đổi vài từ.",
      "Mỗi câu hỏi phải mở ra một góc khai thác mới về năng lực, quyết định, hoặc tác động.",
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
    "Never repeat questions that already appear in the transcript, even with minor wording changes.",
    "Each next question must explore a new angle of skill, decision-making, or impact.",
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
  const latestUserAnswer = getLatestUserAnswerExcerpt(transcript);

  if (language === "en") {
    const candidates: string[] = [
      hasCvContext
        ? `From your CV, which project most clearly proves your fit for the ${role} role, and what measurable impact did you deliver?`
        : `For the ${role} role, describe the most complex project you led and the specific business impact you created.`,
      `In the ${role} role, tell me about a difficult technical trade-off you made and why your final choice was correct.`,
      `Share a production incident you handled in the ${role} role, including root cause, fix strategy, and prevention steps.`,
      `Describe a time you disagreed with a teammate on a technical direction for the ${role} role and how you resolved it.`,
    ];

    if (latestUserAnswer) {
      candidates.push(
        `You mentioned "${latestUserAnswer}". Which measurable result from that work best proves your impact for the ${role} role?`,
      );
    }

    const focusIndex = aiCount % candidates.length;
    const prioritized = [
      candidates[focusIndex],
      ...candidates.filter((_, index) => index !== focusIndex),
    ];

    return pickFreshQuestion(prioritized, transcript, language);
  }

  const candidates: string[] = [
    hasCvContext
      ? `Trong CV của bạn, dự án nào thể hiện rõ nhất sự phù hợp với vị trí ${role}, và tác động định lượng bạn tạo ra là gì?`
      : `Với vị trí ${role}, bạn hãy mô tả dự án phức tạp nhất bạn từng phụ trách và tác động kinh doanh cụ thể bạn tạo ra.`,
    `Ở vai trò ${role}, hãy kể một lần bạn phải đánh đổi kỹ thuật khó (trade-off) và vì sao quyết định cuối cùng là hợp lý.`,
    `Bạn từng xử lý một sự cố production nào liên quan đến vị trí ${role}? Hãy nêu nguyên nhân gốc, cách khắc phục và cách phòng ngừa lặp lại.`,
    `Hãy chia sẻ một tình huống bạn bất đồng quan điểm kỹ thuật với đồng đội ở vị trí ${role} và cách bạn đi đến thống nhất.`,
  ];

  if (latestUserAnswer) {
    candidates.push(
      `Bạn vừa nhắc đến "${latestUserAnswer}". Kết quả định lượng nào từ phần việc đó chứng minh rõ nhất năng lực của bạn cho vị trí ${role}?`,
    );
  }

  const focusIndex = aiCount % candidates.length;
  const prioritized = [
    candidates[focusIndex],
    ...candidates.filter((_, index) => index !== focusIndex),
  ];

  return pickFreshQuestion(prioritized, transcript, language);
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
      return {
        provider: openAIResult.provider,
        nextQuestion: ensureDistinctQuestion(
          openAIResult.nextQuestion,
          transcript,
          language,
          profile,
          cvContext,
        ),
      };
    }
  } catch (error) {
    console.error("OpenAI interviewer failed", error);
  }

  try {
    const geminiResult = await callGemini(transcript, language, profile, cvContext);
    if (geminiResult) {
      return {
        provider: geminiResult.provider,
        nextQuestion: ensureDistinctQuestion(
          geminiResult.nextQuestion,
          transcript,
          language,
          profile,
          cvContext,
        ),
      };
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

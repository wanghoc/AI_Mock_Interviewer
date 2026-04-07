import "server-only";

import {
  generateGeminiContentWithKeyRotation,
  hasGeminiApiKeys,
} from "@/lib/interview/gemini-client";
import type {
  AIProvider,
  CvEvaluationResult,
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

interface ClaudeResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface InterviewerResult {
  provider: AIProvider;
  nextQuestion: string;
}

interface LastExchange {
  question: string;
  answer: string;
}

interface InterviewContext {
  transcript: InterviewTurn[];
  language: "vi" | "en";
  profile?: InterviewCandidateProfile;
  cvContext?: string;
  cvEvaluation?: CvEvaluationResult;
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

function normalizeForComparison(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function tokenSet(input: string): Set<string> {
  return new Set(
    normalizeForComparison(input)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function similarityScore(a: string, b: string): number {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.9;
  }

  const setA = tokenSet(normalizedA);
  const setB = tokenSet(normalizedB);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

function isQuestionTooSimilar(candidate: string, existing: string): boolean {
  return similarityScore(candidate, existing) >= 0.72;
}

function getRecentAiQuestions(transcript: InterviewTurn[], limit = 10): string[] {
  return transcript
    .filter((turn) => turn.role === "ai")
    .slice(-limit)
    .map((turn) => turn.message.trim())
    .filter(Boolean);
}

function getLastExchange(transcript: InterviewTurn[]): LastExchange | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const current = transcript[i];

    if (current.role !== "user" || current.message.trim().length === 0) {
      continue;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      const previous = transcript[j];
      if (previous.role === "ai" && previous.message.trim().length > 0) {
        return {
          question: previous.message.trim(),
          answer: current.message.trim(),
        };
      }
    }
  }

  return null;
}

function hasEchoFromAnswer(question: string, answer: string): boolean {
  const normalizedQuestion = normalizeForComparison(question);
  const normalizedAnswer = normalizeForComparison(answer);

  if (!normalizedQuestion || !normalizedAnswer) {
    return false;
  }

  const answerTokens = normalizedAnswer.split(" ").filter(Boolean);

  if (answerTokens.length < 8) {
    return false;
  }

  for (let i = 0; i <= answerTokens.length - 6; i += 1) {
    const phrase = answerTokens.slice(i, i + 6).join(" ");
    if (phrase.length >= 24 && normalizedQuestion.includes(phrase)) {
      return true;
    }
  }

  return false;
}

function inferDomainContext(context: InterviewContext): string {
  const source = normalizeForComparison(
    [
      context.profile?.targetRole,
      context.profile?.highlights,
      context.cvContext,
      ...(context.cvEvaluation?.recommended_roles ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (
    source.includes("marketing") ||
    source.includes("seo") ||
    source.includes("campaign") ||
    source.includes("content")
  ) {
    return "marketing/digital marketing";
  }

  if (
    source.includes("sales") ||
    source.includes("business development") ||
    source.includes("account")
  ) {
    return "sales/kinh doanh";
  }

  if (
    source.includes("data") ||
    source.includes("analyst") ||
    source.includes("bi") ||
    source.includes("machine learning")
  ) {
    return "data/phân tích dữ liệu";
  }

  if (
    source.includes("product") ||
    source.includes("owner") ||
    source.includes("roadmap")
  ) {
    return "product management";
  }

  return "kỹ thuật phần mềm";
}

function inferDifficulty(context: InterviewContext): "entry" | "mid" {
  const source = normalizeForComparison(
    [
      context.profile?.targetRole,
      context.profile?.highlights,
      ...(context.cvEvaluation?.recommended_roles ?? []),
      context.cvEvaluation?.role_alignment_analysis,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (
    source.includes("intern") ||
    source.includes("thuc tap") ||
    source.includes("fresher") ||
    source.includes("junior")
  ) {
    return "entry";
  }

  return "mid";
}

function summarizeRecentConversation(transcript: InterviewTurn[]): string {
  const recentTurns = transcript.slice(-6);
  return recentTurns
    .map((turn) => {
      const label = turn.role === "ai" ? "Phỏng vấn viên" : "Ứng viên";
      const content = turn.message.length > 200
        ? turn.message.slice(0, 200) + "..."
        : turn.message;
      return `${label}: ${content}`;
    })
    .join("\n");
}

function buildCvSignals(context: InterviewContext): string {
  const signals: string[] = [];

  const projectBreakdown = context.cvEvaluation?.project_breakdown ?? [];
  if (projectBreakdown.length > 0) {
    signals.push("Dự án từ CV:");
    projectBreakdown.slice(0, 3).forEach((item, index) => {
      signals.push(`  ${index + 1}. ${item.project_or_experience} — Nổi bật: ${item.standout_points} | Chưa rõ: ${item.unclear_points}`);
    });
  }

  const redFlags = context.cvEvaluation?.red_flags ?? [];
  if (redFlags.length > 0) {
    signals.push("Cờ đỏ cần xác minh: " + redFlags.slice(0, 3).join("; "));
  }

  const interviewFocus = context.cvEvaluation?.interview_focus ?? [];
  if (interviewFocus.length > 0) {
    signals.push("Trọng tâm cần khai thác: " + interviewFocus.slice(0, 3).join("; "));
  }

  if (signals.length === 0 && context.cvContext) {
    signals.push("Trích đoạn CV: " + context.cvContext.slice(0, 600));
  }

  return signals.join("\n") || "Chưa có thông tin CV chi tiết.";
}

function buildProjectList(context: InterviewContext): string[] {
  const projects = context.cvEvaluation?.project_breakdown ?? [];
  return projects.map((p) => p.project_or_experience).filter(Boolean);
}

function pickNextTopicHint(context: InterviewContext): string {
  const aiCount = context.transcript.filter((t) => t.role === "ai").length;
  const projects = buildProjectList(context);
  const redFlags = context.cvEvaluation?.red_flags ?? [];
  const interviewFocus = context.cvEvaluation?.interview_focus ?? [];

  const allTopics = [
    ...projects.map((p) => `dự án "${p}"`),
    ...redFlags.slice(0, 2).map((f) => `cờ đỏ: ${f}`),
    ...interviewFocus.slice(0, 2).map((f) => `trọng tâm: ${f}`),
  ];

  if (allTopics.length === 0) {
    return "";
  }

  const topicIndex = Math.min(aiCount - 1, allTopics.length - 1);
  return `Gợi ý chủ đề tiếp theo: ${allTopics[Math.max(0, topicIndex)]}`;
}

function buildSystemPrompt(context: InterviewContext): string {
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const candidateName = context.profile?.candidateName?.trim() || "ứng viên";
  const domain = inferDomainContext(context);
  const difficulty = inferDifficulty(context);
  const aiCount = context.transcript.filter((t) => t.role === "ai").length;
  const lastExchange = getLastExchange(context.transcript);
  const shouldDrillDown = lastExchange && wordCount(lastExchange.answer) >= 8;
  const projects = buildProjectList(context);
  const topicHint = pickNextTopicHint(context);

  const projectNameList = projects.length > 0
    ? `Các dự án/kinh nghiệm trong CV: ${projects.map((p) => `"${p}"`).join(", ")}.`
    : "";

  return [
    `Bạn là ${difficulty === "entry" ? "một nhà tuyển dụng thân thiện nhưng sắc sảo" : "một trưởng phòng dày dạn kinh nghiệm"} trong lĩnh vực ${domain}, đang phỏng vấn ${candidateName} cho vị trí ${role}.`,
    "",
    "PHONG CÁCH HỎI:",
    "- Hỏi như đang trò chuyện tự nhiên, KHÔNG phải robot đọc danh sách câu hỏi.",
    "- Bắt đầu bằng phản hồi ngắn gọn về câu trả lời vừa rồi (1 dòng), rồi mới đặt câu hỏi tiếp.",
    "- Mỗi lượt chỉ hỏi MỘT câu hỏi duy nhất, ngắn gọn.",
    "- Toàn bộ bằng tiếng Việt có dấu.",
    "",
    "CHIẾN LƯỢC HỎI (QUAN TRỌNG NHẤT):",
    aiCount <= 1
      ? `- Đây là câu hỏi mở đầu. ${projects.length > 0 ? `NÊU ĐÍCH DANH một dự án từ CV (ví dụ: "${projects[0]}") và hỏi ứng viên mô tả vai trò cụ thể của mình trong dự án đó.` : "Hỏi về dự án/kinh nghiệm gần nhất liên quan đến vị trí."}`
      : shouldDrillDown
        ? "- Ứng viên vừa trả lời chi tiết → BẮT BUỘC hỏi sâu vào chính câu trả lời đó: lý do quyết định, con số kết quả, hoặc thách thức cụ thể."
        : `- Ứng viên trả lời ngắn/chung chung → Chuyển sang chủ đề mới. ${topicHint ? topicHint : "Hỏi về một khía cạnh khác trong CV."}`,
    difficulty === "entry"
      ? "- ĐỘ KHÓ: Fresher/junior → hỏi về trải nghiệm thật, trách nhiệm cá nhân cụ thể. TRÁNH hỏi kiến trúc cao cấp."
      : "- ĐỘ KHÓ: Trung/cao cấp → hỏi về trade-off, quyết định kỹ thuật, tác động đo lường.",
    "",
    "QUY TẮC BẮT BUỘC VỀ NỘI DUNG CÂU HỎI:",
    `- Câu hỏi PHẢI liên quan đến lĩnh vực ${domain} và vị trí ${role}.`,
    projects.length > 0
      ? `- ƯU TIÊN hỏi về dự án/kinh nghiệm CỤ THỂ trong CV. ${projectNameList} Nêu đích danh tên dự án khi hỏi.`
      : "- Hỏi về kinh nghiệm thực tế, tình huống cụ thể, KHÔNG hỏi lý thuyết trừu tượng.",
    "- KHÔNG lặp lại câu hỏi đã hỏi (xem danh sách recent_questions_list).",
    "- KHÔNG copy nguyên văn câu trả lời ứng viên.",
    "- MỖI câu hỏi phải KHÁC BIỆT rõ ràng về chủ đề so với câu trước.",
    "",
    "THÔNG TIN CV:",
    buildCvSignals(context),
    "",
    'Trả về JSON: { "next_question": "..." }',
  ].join("\n");
}

function buildUserPayload(context: InterviewContext): string {
  const recentQuestions = getRecentAiQuestions(context.transcript, 8);
  const lastExchange = getLastExchange(context.transcript);
  const projects = context.cvEvaluation?.project_breakdown ?? [];

  return JSON.stringify({
    language: "vi",
    target_role: context.profile?.targetRole ?? "",
    candidate_name: context.profile?.candidateName ?? "",
    cv_highlights: context.profile?.highlights ?? "",
    cv_projects: projects.slice(0, 4).map((p) => ({
      name: p.project_or_experience,
      standout: p.standout_points,
      unclear: p.unclear_points,
    })),
    cv_red_flags: (context.cvEvaluation?.red_flags ?? []).slice(0, 3),
    cv_recommended_roles: (context.cvEvaluation?.recommended_roles ?? []).slice(0, 3),
    conversation_so_far: summarizeRecentConversation(context.transcript),
    total_questions_asked: context.transcript.filter((t) => t.role === "ai").length,
    recent_questions_list: recentQuestions,
    last_exchange: lastExchange,
  });
}

function extractQuestionFromContent(content: string): string {
  const parsed = safeJsonParse(content);

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (typeof record.next_question === "string" && record.next_question.trim().length > 0) {
      return record.next_question.trim();
    }
  }

  const plain = stripCodeFence(content).trim();
  if (plain.length > 0 && plain.length < 500) {
    return plain;
  }

  return "";
}

function getRoleLabelForQuestion(context: InterviewContext): string {
  const role = context.profile?.targetRole?.trim();
  if (!role) {
    return "vị trí ứng tuyển";
  }
  return role;
}

function buildFallbackQuestion(context: InterviewContext): string {
  const role = getRoleLabelForQuestion(context);
  const difficulty = inferDifficulty(context);
  const aiCount = context.transcript.filter((t) => t.role === "ai").length;
  const projects = buildProjectList(context);
  const redFlags = context.cvEvaluation?.red_flags ?? [];
  const interviewFocus = context.cvEvaluation?.interview_focus ?? [];

  if (aiCount <= 1) {
    if (projects.length > 0) {
      return `Chào bạn! Tôi thấy trong CV bạn có nhắc đến "${projects[0]}". Bạn có thể mô tả cụ thể vai trò của bạn trong đó — bạn trực tiếp phụ trách phần nào và kết quả ra sao?`;
    }
    if (difficulty === "entry") {
      return `Chào bạn! Để bắt đầu, bạn hãy kể về một dự án hoặc đầu việc gần nhất liên quan đến ${role} — bạn trực tiếp làm phần nào và kết quả ra sao?`;
    }
    return `Chào bạn! Với kinh nghiệm cho vị trí ${role}, hãy kể về một dự án gần đây bạn chịu trách nhiệm chính — bối cảnh, quyết định quan trọng, và kết quả đo lường được.`;
  }

  const drillDownPool = [
    "Ở phần việc bạn vừa nói, bạn gặp khó khăn lớn nhất ở bước nào và xử lý thế nào?",
    "Vậy kết quả cụ thể đo lường được từ phần việc đó là gì — bạn có con số nào không?",
    "Trước khi chọn cách làm đó, bạn đã cân nhắc phương án nào khác và vì sao loại bỏ?",
    "Nếu được làm lại, bạn sẽ thay đổi điều gì trong cách tiếp cận?",
    "Bạn đã phối hợp với ai trong quá trình đó và vai trò cụ thể của bạn khác gì so với các thành viên khác?",
  ];

  const topicPool: string[] = [];

  for (let i = 0; i < projects.length; i++) {
    if (i === 0 && aiCount <= 2) continue;
    topicPool.push(`Tôi muốn hỏi về "${projects[i]}" trong CV của bạn — bạn phụ trách phần nào cụ thể và thành tựu đáng nhớ nhất là gì?`);
  }

  for (const flag of redFlags.slice(0, 2)) {
    topicPool.push(`Tôi chú ý một điểm trong CV: ${flag.toLowerCase()}. Bạn có thể giải thích rõ hơn không?`);
  }

  for (const focus of interviewFocus.slice(0, 2)) {
    topicPool.push(`Về phần ${focus.toLowerCase()} — bạn có thể chia sẻ một tình huống cụ thể không?`);
  }

  topicPool.push(
    `Với vị trí ${role}, bạn hãy kể một tình huống bạn phải tự mình đưa ra quyết định quan trọng mà không có hướng dẫn sẵn.`,
    `Bạn đã bao giờ nhận phản hồi tiêu cực từ đồng nghiệp hoặc quản lý chưa? Bạn xử lý thế nào?`,
    `Điều gì khiến bạn chọn ${role} thay vì các hướng nghề nghiệp khác?`,
  );

  const recentQuestions = getRecentAiQuestions(context.transcript);

  const lastExchange = getLastExchange(context.transcript);
  if (lastExchange && wordCount(lastExchange.answer) >= 8) {
    const drillIndex = (aiCount - 1) % drillDownPool.length;
    const candidate = drillDownPool[drillIndex];
    if (!recentQuestions.some((q) => isQuestionTooSimilar(candidate, q))) {
      return candidate;
    }
  }

  for (const candidate of topicPool) {
    if (!recentQuestions.some((q) => isQuestionTooSimilar(candidate, q))) {
      return candidate;
    }
  }

  if (difficulty === "entry") {
    return `Bạn hãy chọn một kỹ năng bạn tự tin nhất liên quan đến ${role} và kể một tình huống bạn đã áp dụng nó trong thực tế.`;
  }

  return `Với vị trí ${role}, bạn hãy chia sẻ cách bạn ưu tiên công việc khi có nhiều task quan trọng cùng lúc — một ví dụ cụ thể?`;
}

function containsEnglishNoise(question: string): boolean {
  const normalized = normalizeForComparison(question);

  const patterns = [
    "you ",
    "candidate ",
    "return only",
    "json",
    "must ",
    "strict",
    "follow up",
    "here is",
    "as an ai",
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

function enforceQuestionQuality(rawQuestion: string, context: InterviewContext): string {
  const candidate = rawQuestion.trim();
  const recentQuestions = getRecentAiQuestions(context.transcript);
  const exchange = getLastExchange(context.transcript);

  if (!candidate || candidate.length < 10) {
    return buildFallbackQuestion(context);
  }

  if (containsEnglishNoise(candidate)) {
    return buildFallbackQuestion(context);
  }

  if (recentQuestions.some((question) => isQuestionTooSimilar(candidate, question))) {
    return buildFallbackQuestion(context);
  }

  if (exchange && hasEchoFromAnswer(candidate, exchange.answer)) {
    return buildFallbackQuestion(context);
  }

  return candidate;
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

async function callOpenAI(context: InterviewContext): Promise<InterviewerResult | null> {
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
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(context),
        },
        {
          role: "user",
          content: buildUserPayload(context),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI interviewer failed with status ${response.status}.`);
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI interviewer returned empty content.");
  }

  return {
    provider: "openai",
    nextQuestion: extractQuestionFromContent(content),
  };
}

async function callGemini(context: InterviewContext): Promise<InterviewerResult | null> {
  if (!hasGeminiApiKeys()) {
    return null;
  }

  const models = getGeminiModels();

  for (const model of models) {
    const response = await generateGeminiContentWithKeyRotation(model, {
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(context) }],
      },
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPayload(context) }],
        },
      ],
    });

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new Error(`Gemini interviewer failed with status ${response.status}.`);
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (!content) {
      throw new Error("Gemini interviewer returned empty content.");
    }

    return {
      provider: "gemini",
      nextQuestion: extractQuestionFromContent(content),
    };
  }

  return null;
}

async function callClaude(context: InterviewContext): Promise<InterviewerResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0.6,
      system: buildSystemPrompt(context),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildUserPayload(context) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude interviewer failed with status ${response.status}.`);
  }

  const data = (await response.json()) as ClaudeResponse;
  const content = data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();

  if (!content) {
    throw new Error("Claude interviewer returned empty content.");
  }

  return {
    provider: "claude",
    nextQuestion: extractQuestionFromContent(content),
  };
}

export async function generateInterviewQuestion(
  transcript: InterviewTurn[],
  language: "vi" | "en" = "vi",
  profile?: InterviewCandidateProfile,
  cvContext?: string,
  cvEvaluation?: CvEvaluationResult,
): Promise<InterviewerResult> {
  const context: InterviewContext = {
    transcript,
    language,
    profile,
    cvContext,
    cvEvaluation,
  };

  try {
    const openAIResult = await callOpenAI(context);
    if (openAIResult && openAIResult.nextQuestion) {
      return {
        provider: openAIResult.provider,
        nextQuestion: enforceQuestionQuality(openAIResult.nextQuestion, context),
      };
    }
  } catch (error) {
    console.error("OpenAI interviewer unavailable", error);
  }

  try {
    const geminiResult = await callGemini(context);
    if (geminiResult && geminiResult.nextQuestion) {
      return {
        provider: geminiResult.provider,
        nextQuestion: enforceQuestionQuality(geminiResult.nextQuestion, context),
      };
    }
  } catch (error) {
    console.error("Gemini interviewer unavailable", error);
  }

  try {
    const claudeResult = await callClaude(context);
    if (claudeResult && claudeResult.nextQuestion) {
      return {
        provider: claudeResult.provider,
        nextQuestion: enforceQuestionQuality(claudeResult.nextQuestion, context),
      };
    }
  } catch (error) {
    console.error("Claude interviewer unavailable", error);
  }

  return {
    provider: "fallback",
    nextQuestion: buildFallbackQuestion(context),
  };
}

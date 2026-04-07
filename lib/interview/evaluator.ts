import "server-only";

import {
  generateGeminiContentWithKeyRotation,
  hasGeminiApiKeys,
} from "@/lib/interview/gemini-client";
import type {
  InterviewCandidateProfile,
  InterviewDetailedReviewItem,
  InterviewEvaluationResult,
  InterviewTurn,
  StrictAnswerEvaluation,
} from "@/lib/interview/types";

type Provider = "openai" | "gemini" | "claude" | "fallback";

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

interface ClaudeResponse {
  content?: Array<{
    type?: string;
    text?: string;
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

interface BatchEvaluationRaw {
  per_question: Array<{
    score: number;
    is_off_topic: boolean;
    candidate_flaws: string;
    ideal_answer: string;
  }>;
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
}

const UNANSWERED_TEXT = "Ứng viên chưa trả lời câu hỏi này.";
const UNANSWERED_MARKERS = [
  "ung vien chua tra loi cau hoi nay",
  "did not provide an answer",
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

function clampScore10(rawValue: unknown): number {
  if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
    return 4;
  }

  return Math.max(0, Math.min(10, Math.round(rawValue)));
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

function isUnanswered(input: string): boolean {
  const normalized = normalizeForComparison(input);
  return UNANSWERED_MARKERS.some((marker) => normalized.includes(marker));
}

function isIdkAnswer(input: string): boolean {
  const normalized = normalizeForComparison(input);

  const patterns = [
    "toi khong biet",
    "em khong biet",
    "minh khong biet",
    "khong biet",
    "khong ro",
    "chua ro",
    "i dont know",
    "dont know",
    "not sure",
    "no idea",
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

function tokenSet(input: string): Set<string> {
  return new Set(
    normalizeForComparison(input)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function topicOverlapScore(question: string, answer: string): number {
  const questionTokens = tokenSet(question);
  const answerTokens = tokenSet(answer);

  if (questionTokens.size === 0 || answerTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of answerTokens) {
    if (questionTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / questionTokens.size;
}

function isFirstPerson(text: string): boolean {
  const normalized = normalizeForComparison(text);

  return (
    normalized.startsWith("toi ") ||
    normalized.includes(" toi ") ||
    normalized.startsWith("minh ") ||
    normalized.includes(" minh ") ||
    normalized.startsWith("em ") ||
    normalized.includes(" em ") ||
    normalized.startsWith("i ") ||
    normalized.includes(" i ")
  );
}

function hasAdviceTone(text: string): boolean {
  const normalized = normalizeForComparison(text);

  const banned = [
    "ban nen",
    "ban can",
    "ung vien nen",
    "you should",
    "candidate should",
    "a good answer should",
    "hay dung cau truc",
    "star framework",
  ];

  return banned.some((pattern) => normalized.includes(pattern));
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
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
        userAnswer = nextTurn.message.trim() || UNANSWERED_TEXT;
        break;
      }

      if (nextTurn.role === "ai") {
        break;
      }
    }

    pairs.push({
      id: `qa-${pairs.length + 1}`,
      question: turn.message.trim(),
      userAnswer,
    });
  }

  return pairs;
}

type DomainHint = "marketing" | "sales" | "data" | "product" | "design" | "software" | "generic";

function inferDomain(context: EvaluationContext): DomainHint {
  const source = normalizeForComparison(
    [
      context.profile?.targetRole,
      context.profile?.highlights,
      context.cvText?.slice(0, 2000),
      context.cvEvaluationSummary,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (source.includes("marketing") || source.includes("seo") || source.includes("campaign") || source.includes("content") || source.includes("ads")) {
    return "marketing";
  }
  if (source.includes("sales") || source.includes("business development") || source.includes("kinh doanh")) {
    return "sales";
  }
  if (source.includes("data") || source.includes("analyst") || source.includes("bi ") || source.includes("machine learning")) {
    return "data";
  }
  if (source.includes("product") || source.includes("owner") || source.includes("roadmap")) {
    return "product";
  }
  if (source.includes("design") || source.includes("ux") || source.includes("ui") || source.includes("figma")) {
    return "design";
  }
  if (source.includes("developer") || source.includes("engineer") || source.includes("frontend") || source.includes("backend") || source.includes("fullstack")) {
    return "software";
  }
  return "generic";
}

function pickDomainTools(context: EvaluationContext): string {
  const source = normalizeForComparison(
    [context.profile?.highlights, context.cvText?.slice(0, 3000), context.profile?.targetRole]
      .filter(Boolean)
      .join(" "),
  );

  const domain = inferDomain(context);

  const domainToolMap: Record<DomainHint, Array<{ keyword: string; label: string }>> = {
    marketing: [
      { keyword: "google ads", label: "Google Ads" },
      { keyword: "facebook ads", label: "Facebook Ads" },
      { keyword: "tiktok", label: "TikTok Ads" },
      { keyword: "seo", label: "SEO" },
      { keyword: "google analytics", label: "Google Analytics" },
      { keyword: "content", label: "Content Marketing" },
      { keyword: "email", label: "Email Marketing" },
      { keyword: "canva", label: "Canva" },
    ],
    sales: [
      { keyword: "crm", label: "CRM" },
      { keyword: "hubspot", label: "HubSpot" },
      { keyword: "salesforce", label: "Salesforce" },
      { keyword: "pipeline", label: "quản lý pipeline" },
      { keyword: "telesales", label: "telesales" },
    ],
    data: [
      { keyword: "python", label: "Python" },
      { keyword: "sql", label: "SQL" },
      { keyword: "power bi", label: "Power BI" },
      { keyword: "tableau", label: "Tableau" },
      { keyword: "excel", label: "Excel nâng cao" },
      { keyword: "pandas", label: "Pandas" },
    ],
    product: [
      { keyword: "jira", label: "Jira" },
      { keyword: "figma", label: "Figma" },
      { keyword: "notion", label: "Notion" },
      { keyword: "roadmap", label: "roadmap sản phẩm" },
    ],
    design: [
      { keyword: "figma", label: "Figma" },
      { keyword: "photoshop", label: "Photoshop" },
      { keyword: "illustrator", label: "Illustrator" },
    ],
    software: [
      { keyword: "react", label: "React" },
      { keyword: "next", label: "Next.js" },
      { keyword: "node", label: "Node.js" },
      { keyword: "python", label: "Python" },
      { keyword: "java", label: "Java" },
      { keyword: "typescript", label: "TypeScript" },
      { keyword: "docker", label: "Docker" },
      { keyword: "aws", label: "AWS" },
    ],
    generic: [],
  };

  const tools = domainToolMap[domain] ?? [];
  const found: string[] = [];

  for (const tool of tools) {
    if (source.includes(normalizeForComparison(tool.keyword))) {
      found.push(tool.label);
    }
  }

  if (found.length > 0) {
    return found.slice(0, 3).join(", ");
  }

  const domainFallbacks: Record<DomainHint, string> = {
    marketing: "các công cụ digital marketing",
    sales: "quy trình bán hàng và CRM",
    data: "công cụ phân tích dữ liệu",
    product: "công cụ quản lý sản phẩm",
    design: "công cụ thiết kế",
    software: "các công nghệ phần mềm",
    generic: "các công cụ chuyên ngành",
  };

  return domainFallbacks[domain];
}

function buildIdealAnswerFallback(pair: QuestionAnswerPair, context: EvaluationContext): string {
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const tools = pickDomainTools(context);
  const domain = inferDomain(context);

  const questionNormalized = normalizeForComparison(pair.question);

  if (questionNormalized.includes("du an") || questionNormalized.includes("project") || questionNormalized.includes("kinh nghiem")) {
    return `Tôi đã trực tiếp phụ trách một dự án liên quan đến ${role}, sử dụng ${tools}. Tôi xác định rõ mục tiêu, phân chia công việc theo từng giai đoạn, và tự chủ xử lý các vấn đề phát sinh. Kết quả cuối cùng tôi đạt được là cải thiện chỉ số KPI chính lên khoảng 20-30% so với trước khi triển khai, và tôi rút ra bài học quan trọng về cách quản lý thời gian và ưu tiên công việc.`;
  }

  if (questionNormalized.includes("kho khan") || questionNormalized.includes("thach thuc") || questionNormalized.includes("van de")) {
    return `Tôi từng gặp một tình huống khó khi deadline gấp và yêu cầu thay đổi liên tục trong vai trò ${role}. Tôi đã bình tĩnh phân tích gốc rễ vấn đề, đề xuất 2-3 phương án với ưu nhược điểm rõ ràng cho quản lý trực tiếp, rồi triển khai phương án được chọn. Kết quả là tôi hoàn thành đúng hạn và nhận được phản hồi tích cực từ đội ngũ.`;
  }

  if (questionNormalized.includes("ket qua") || questionNormalized.includes("do luong") || questionNormalized.includes("chi so") || questionNormalized.includes("thanh tuu")) {
    return `Tôi đo lường kết quả bằng các chỉ số cụ thể phù hợp với vai trò ${role}. Ví dụ trong dự án gần nhất, tôi đặt mục tiêu rõ ràng từ đầu, theo dõi tiến độ hàng tuần bằng ${tools}, và cuối cùng đạt được kết quả vượt mục tiêu ban đầu khoảng 15%. Tôi cũng tổng hợp bài học kinh nghiệm để áp dụng cho các dự án tiếp theo.`;
  }

  const domainTemplates: Record<DomainHint, string> = {
    marketing: `Tôi đã triển khai một chiến dịch marketing cho ${role}, bắt đầu từ việc nghiên cứu đối tượng mục tiêu, lên kế hoạch nội dung và phân bổ ngân sách qua ${tools}. Tôi theo dõi hiệu quả chiến dịch bằng các chỉ số CTR, conversion rate, và chi phí trên mỗi chuyển đổi. Kết quả cho thấy hiệu suất tăng đáng kể so với giai đoạn trước, và tôi rút ra kinh nghiệm quan trọng về việc tối ưu thông điệp phù hợp từng kênh.`,
    sales: `Tôi đã quản lý pipeline bán hàng cho ${role}, từ việc tiếp cận khách hàng tiềm năng, nuôi dưỡng mối quan hệ, đến chốt deal. Tôi sử dụng ${tools} để theo dõi từng giai đoạn và dự báo doanh thu. Kết quả là tôi đạt được chỉ tiêu doanh số và xây dựng được quy trình bán hàng có thể nhân rộng cho đội ngũ.`,
    data: `Tôi đã phân tích một bộ dữ liệu lớn liên quan đến ${role}, sử dụng ${tools} để làm sạch, xử lý và trực quan hóa. Tôi đặt giả thuyết rõ ràng, kiểm định bằng phương pháp phù hợp, và trình bày insight dưới dạng dashboard dễ hiểu cho stakeholder. Kết quả là đề xuất của tôi được áp dụng và mang lại cải thiện đo lường được cho quy trình kinh doanh.`,
    product: `Tôi đã phụ trách một tính năng sản phẩm từ giai đoạn discovery đến delivery cho ${role}. Tôi phỏng vấn người dùng, định nghĩa user story, phối hợp với đội kỹ thuật và theo dõi adoption sau khi release bằng ${tools}. Kết quả là tính năng được người dùng đón nhận tích cực với tỷ lệ sử dụng đạt mục tiêu đề ra.`,
    design: `Tôi đã thiết kế giao diện cho một sản phẩm liên quan đến ${role}, bắt đầu từ research người dùng, tạo wireframe và prototype bằng ${tools}. Tôi tiến hành usability testing, thu thập feedback và iterate thiết kế qua nhiều vòng. Kết quả cuối cùng được đội phát triển triển khai thành công và cải thiện trải nghiệm người dùng.`,
    software: `Tôi đã xây dựng một module quan trọng cho ${role}, sử dụng ${tools}. Tôi phân tích yêu cầu, thiết kế giải pháp kỹ thuật có xem xét về hiệu năng và bảo trì, rồi triển khai kèm test coverage đầy đủ. Kết quả là hệ thống chạy ổn định, xử lý được lượng tải thực tế và nhận phản hồi tốt từ đội code review.`,
    generic: `Tôi đã trực tiếp đảm nhận một đầu việc quan trọng cho ${role}. Tôi lên kế hoạch rõ ràng, phối hợp với các bên liên quan, và tự chủ giải quyết các vấn đề phát sinh trong quá trình triển khai. Kết quả cuối cùng đạt được mục tiêu đề ra và tôi rút ra kinh nghiệm quý giá cho các dự án tiếp theo.`,
  };

  return domainTemplates[domain];
}

function normalizeIdealAnswer(
  rawIdealAnswer: unknown,
  pair: QuestionAnswerPair,
  context: EvaluationContext,
  forceFallback: boolean,
): string {
  const fallback = buildIdealAnswerFallback(pair, context);

  if (forceFallback || typeof rawIdealAnswer !== "string") {
    return fallback;
  }

  const cleaned = rawIdealAnswer.trim();

  if (!cleaned || wordCount(cleaned) < 15) {
    return fallback;
  }

  if (hasAdviceTone(cleaned)) {
    return fallback;
  }

  return cleaned;
}

function buildBatchSystemPrompt(context: EvaluationContext): string {
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";
  const candidateName = context.profile?.candidateName?.trim() || "ứng viên";

  return [
    `Bạn là giám khảo phỏng vấn chuyên nghiệp với 10+ năm kinh nghiệm tuyển dụng trong lĩnh vực ${inferDomain(context) === "software" ? "công nghệ phần mềm" : inferDomain(context) === "marketing" ? "marketing" : inferDomain(context) === "data" ? "dữ liệu" : inferDomain(context) === "sales" ? "kinh doanh" : "chuyên ngành"}, đang chấm toàn bộ buổi phỏng vấn của ${candidateName} cho vai trò ${role}.`,
    "",
    "NHIỆM VỤ: Đánh giá TOÀN BỘ các cặp câu hỏi-câu trả lời trong một lần duy nhất, đồng thời đưa ra nhận xét tổng thể.",
    "",
    "YÊU CẦU CHẤM ĐIỂM TỪNG CÂU:",
    "- score (0-10): 0-2 = không trả lời/hoàn toàn sai, 3-4 = yếu/thiếu chiều sâu, 5-6 = trung bình/có ý nhưng chưa đủ, 7-8 = khá tốt/có bằng chứng cụ thể, 9-10 = xuất sắc/trả lời như chuyên gia thật.",
    "- is_off_topic: true nếu câu trả lời không liên quan đến câu hỏi.",
    "- candidate_flaws: chỉ ra điểm yếu CỤ THỂ của câu trả lời (không nhận xét chung chung kiểu 'cần cải thiện thêm').",
    "- ideal_answer: viết câu trả lời mẫu MỖI CÂU PHẢI KHÁC NHAU và BÁM SÁT NỘI DUNG CÂU HỎI. Viết ở ngôi thứ nhất (tôi/em/mình), dài 3-5 câu, có tình huống CỤ THỂ + hành động + kết quả. Dùng thuật ngữ phù hợp ngành nghề của ứng viên. KHÔNG viết lời khuyên ('bạn nên', 'ứng viên nên'). KHÔNG copy-paste cùng một mẫu cho nhiều câu.",
    "",
    "YÊU CẦU ĐÁNH GIÁ TỔNG THỂ:",
    "- overall_score (0-100): điểm tổng phản ánh THỰC LỰC qua buổi phỏng vấn.",
    "- strengths: 2-4 điểm mạnh RÚT RA TỪ CÂU TRẢ LỜI THỰC TẾ (trích dẫn ý cụ thể ứng viên đã nói, không nhận xét chung chung).",
    "- weaknesses: 2-4 điểm yếu RÚT RA TỪ CÂU TRẢ LỜI THỰC TẾ (nêu rõ thiếu gì, ở câu nào).",
    "- summary: 2-3 câu nhận xét tổng kết như một nhà tuyển dụng thật sẽ viết trong báo cáo phỏng vấn, bao gồm kết luận hire/no-hire/cần thêm vòng.",
    "",
    "NGUYÊN TẮC:",
    "1) Chấm thẳng tay - không nới điểm vì lịch sự. Câu trả lời ngắn < 15 từ hoặc 'không biết' → tối đa 3 điểm.",
    "2) Toàn bộ nội dung trả về phải bằng tiếng Việt có dấu.",
    "3) strengths và weaknesses phải dẫn chứng từ câu trả lời cụ thể, không generic.",
    "",
    "Trả về DUY NHẤT JSON hợp lệ theo schema:",
    '{',
    '  "per_question": [{ "score": number, "is_off_topic": boolean, "candidate_flaws": string, "ideal_answer": string }],',
    '  "overall_score": number,',
    '  "strengths": [string],',
    '  "weaknesses": [string],',
    '  "summary": string',
    '}',
  ].join("\n");
}

function buildBatchUserPayload(
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): string {
  return JSON.stringify({
    language: "vi",
    profile: context.profile,
    cv_text_excerpt: context.cvText?.slice(0, 6000) ?? "",
    cv_evaluation_summary: context.cvEvaluationSummary?.slice(0, 1500) ?? "",
    total_questions: pairs.length,
    qa_pairs: pairs.map((pair, index) => ({
      index: index + 1,
      question: pair.question,
      candidate_answer: pair.userAnswer,
      answer_word_count: wordCount(pair.userAnswer),
      is_unanswered: isUnanswered(pair.userAnswer),
      contains_idk_phrase: isIdkAnswer(pair.userAnswer),
    })),
  });
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

function normalizeStrictAnswer(
  raw: unknown,
  pair: QuestionAnswerPair,
  context: EvaluationContext,
): StrictAnswerEvaluation {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const answer = pair.userAnswer;
  const answerTooShort = wordCount(answer) < 15;
  const answerLooksIdk = isIdkAnswer(answer);
  const heuristicOffTopic = topicOverlapScore(pair.question, answer) < 0.08 && wordCount(answer) >= 8;

  let score = clampScore10(record.score);
  const modelOffTopic = record.is_off_topic === true;
  const isOffTopic = modelOffTopic || heuristicOffTopic || answerLooksIdk;

  if (isOffTopic || answerTooShort || answerLooksIdk) {
    score = Math.min(score, 3);
  }

  const flawParts: string[] = [];

  if (typeof record.candidate_flaws === "string" && record.candidate_flaws.trim().length > 0) {
    flawParts.push(record.candidate_flaws.trim());
  }

  if (answerTooShort && !flawParts.some((f) => f.includes("ngắn"))) {
    flawParts.push("Câu trả lời quá ngắn, không đủ dữ liệu để đánh giá độ sâu.");
  }

  if (answerLooksIdk && !flawParts.some((f) => f.includes("không biết") || f.includes("chưa nắm"))) {
    flawParts.push("Ứng viên thể hiện chưa nắm kiến thức hoặc chưa tự tin về chủ đề này.");
  }

  if (isOffTopic && !flawParts.some((f) => f.includes("lệch") || f.includes("lạc đề"))) {
    flawParts.push("Câu trả lời lệch trọng tâm hoặc không bám đúng ý định câu hỏi.");
  }

  const idealAnswer = normalizeIdealAnswer(
    record.ideal_answer,
    pair,
    context,
    false,
  );

  return {
    score,
    is_off_topic: isOffTopic,
    candidate_flaws:
      flawParts.join(" ") ||
      "Câu trả lời thiếu chiều sâu và chưa có bằng chứng cụ thể.",
    ideal_answer: idealAnswer,
  };
}

function normalizeBatchResult(
  raw: unknown,
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): { perQuestion: StrictAnswerEvaluation[]; overallScore: number; strengths: string[]; weaknesses: string[]; summary: string } | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const perQuestionRaw = record.per_question;

  if (!Array.isArray(perQuestionRaw) || perQuestionRaw.length !== pairs.length) {
    return null;
  }

  const perQuestion = perQuestionRaw.map((item, index) =>
    normalizeStrictAnswer(item, pairs[index], context),
  );

  const overallScore = typeof record.overall_score === "number"
    ? Math.max(0, Math.min(100, Math.round(record.overall_score)))
    : computeFallbackScore(perQuestion);

  const strengths = normalizeStringArray(record.strengths, 2, 4);
  const weaknesses = normalizeStringArray(record.weaknesses, 2, 4);

  const summary = typeof record.summary === "string" && record.summary.trim().length > 20
    ? record.summary.trim()
    : "";

  if (!summary) {
    return null;
  }

  return { perQuestion, overallScore, strengths, weaknesses, summary };
}

function normalizeStringArray(input: unknown, min: number, max: number): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const cleaned = input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 10);

  if (cleaned.length < min) {
    return [];
  }

  return cleaned.slice(0, max);
}

function computeFallbackScore(items: StrictAnswerEvaluation[]): number {
  if (items.length === 0) {
    return 0;
  }

  const average = items.reduce((sum, item) => sum + item.score, 0) / items.length;
  const offTopicCount = items.filter((item) => item.is_off_topic).length;

  const raw = Math.round(average * 10 - offTopicCount * 4);
  return Math.max(0, Math.min(100, raw));
}

async function batchEvaluateWithOpenAI(
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): Promise<{ provider: Provider; raw: BatchEvaluationRaw } | null> {
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
        { role: "system", content: buildBatchSystemPrompt(context) },
        { role: "user", content: buildBatchUserPayload(pairs, context) },
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
  if (!parsed) {
    return null;
  }

  return { provider: "openai", raw: parsed as BatchEvaluationRaw };
}

async function batchEvaluateWithGemini(
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): Promise<{ provider: Provider; raw: BatchEvaluationRaw } | null> {
  if (!hasGeminiApiKeys()) {
    return null;
  }

  const models = getGeminiModels();

  for (const model of models) {
    const response = await generateGeminiContentWithKeyRotation(model, {
      systemInstruction: {
        parts: [{ text: buildBatchSystemPrompt(context) }],
      },
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildBatchUserPayload(pairs, context) }],
        },
      ],
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
    if (!parsed) {
      continue;
    }

    return { provider: "gemini", raw: parsed as BatchEvaluationRaw };
  }

  return null;
}

async function batchEvaluateWithClaude(
  pairs: QuestionAnswerPair[],
  context: EvaluationContext,
): Promise<{ provider: Provider; raw: BatchEvaluationRaw } | null> {
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
      max_tokens: 3000,
      temperature: 0.2,
      system: buildBatchSystemPrompt(context),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildBatchUserPayload(pairs, context) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as ClaudeResponse;
  const content = data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();

  if (!content) {
    return null;
  }

  const parsed = safeJsonParse(content);
  if (!parsed) {
    return null;
  }

  return { provider: "claude", raw: parsed as BatchEvaluationRaw };
}

function buildDetailedReview(
  pairs: QuestionAnswerPair[],
  pairResults: StrictAnswerEvaluation[],
): InterviewDetailedReviewItem[] {
  return pairs.map((pair, index) => {
    const review = pairResults[index];

    return {
      id: `review-${index + 1}`,
      question: pair.question,
      user_answer: pair.userAnswer,
      score: review.score,
      is_off_topic: review.is_off_topic,
      candidate_flaws: review.candidate_flaws,
      ideal_answer: review.ideal_answer,
      feedback: review.candidate_flaws,
      suggested_answer: review.ideal_answer,
    };
  });
}

function buildFallbackStrengths(items: InterviewDetailedReviewItem[]): string[] {
  const strongItems = items.filter((item) => item.score >= 7);

  if (strongItems.length === 0) {
    return [
      "Ứng viên có phản hồi cơ bản ở một số câu hỏi, đủ để tạo mặt bằng đánh giá ban đầu.",
      "Vẫn còn tiềm năng cải thiện nếu tăng tính cụ thể và bằng chứng thực tế trong câu trả lời.",
    ];
  }

  return [
    `Ứng viên trả lời khá tốt ở ${strongItems.length}/${items.length} câu hỏi, thể hiện kiến thức nền tảng.`,
    "Một số câu trả lời có tình huống và dữ liệu cụ thể, cho thấy trải nghiệm thực chiến.",
  ];
}

function buildFallbackWeaknesses(items: InterviewDetailedReviewItem[]): string[] {
  const weakItems = items.filter((item) => item.score < 5);
  const offTopicCount = items.filter((item) => item.is_off_topic).length;
  const shortCount = items.filter((item) => wordCount(item.user_answer) < 15).length;

  const weaknesses: string[] = [];

  if (weakItems.length > 0) {
    weaknesses.push(`${weakItems.length}/${items.length} câu trả lời chưa đạt yêu cầu (dưới 5/10 điểm), cho thấy kiến thức chưa đồng đều.`);
  }

  if (offTopicCount > 0) {
    weaknesses.push(`${offTopicCount} câu trả lời lệch trọng tâm, cần cải thiện khả năng nắm bắt ý câu hỏi.`);
  }

  if (shortCount > 0) {
    weaknesses.push(`${shortCount} câu trả lời quá ngắn (< 15 từ), thiếu chi tiết để đánh giá năng lực.`);
  }

  if (weaknesses.length === 0) {
    weaknesses.push("Nhiều câu trả lời thiếu số liệu đo lường và chưa làm rõ mức độ sở hữu công việc.");
  }

  weaknesses.push("Cần cải thiện cấu trúc lập luận và bổ sung bằng chứng cụ thể hơn.");

  return weaknesses;
}

function buildFallbackSummary(score: number): string {
  if (score < 30) {
    return "Buổi phỏng vấn cho thấy ứng viên chưa đáp ứng được yêu cầu cơ bản. Đề xuất: Không đủ điều kiện qua vòng này, cần bổ sung kiến thức nền tảng đáng kể trước khi phỏng vấn lại.";
  }

  if (score < 50) {
    return "Ứng viên có kiến thức nền tảng nhưng chưa thể hiện chiều sâu cần thiết. Đề xuất: Chưa nên hire ở thời điểm hiện tại, có thể xem xét lại sau 3-6 tháng nếu ứng viên bổ sung kinh nghiệm.";
  }

  if (score < 70) {
    return "Ứng viên đạt mức trung bình khá, có nền tảng chấp nhận được nhưng thiếu ổn định giữa các câu. Đề xuất: Cần thêm một vòng phỏng vấn chuyên sâu để xác thực năng lực trước khi ra quyết định.";
  }

  if (score < 85) {
    return "Ứng viên thể hiện tốt, phần lớn câu trả lời bám đúng trọng tâm và có chiều sâu. Đề xuất: Đủ điều kiện để qua vòng, nên kiểm tra thêm khả năng làm việc nhóm và culture fit.";
  }

  return "Ứng viên thể hiện xuất sắc với câu trả lời chất lượng cao, có bằng chứng thực tế rõ ràng. Đề xuất: Nên ưu tiên hire, phù hợp tốt với yêu cầu vị trí.";
}

function hasAnyUserAnswer(transcript: InterviewTurn[]): boolean {
  return transcript.some(
    (turn) => turn.role === "user" && turn.message.trim().length > 0,
  );
}

function createNoAnswerEvaluation(
  transcript: InterviewTurn[],
  context: EvaluationContext,
): InterviewEvaluationResult {
  const pairs = extractQuestionAnswerPairs(transcript);
  const details = pairs.map((pair, index) => {
    const ideal = buildIdealAnswerFallback(pair, context);

    return {
      id: `review-${index + 1}`,
      question: pair.question,
      user_answer: UNANSWERED_TEXT,
      score: 0,
      is_off_topic: true,
      candidate_flaws:
        "Ứng viên không cung cấp câu trả lời cho câu hỏi này.",
      ideal_answer: ideal,
      feedback: "Ứng viên không cung cấp câu trả lời cho câu hỏi này.",
      suggested_answer: ideal,
    };
  });

  return {
    score: 0,
    strengths: ["Phiên phỏng vấn đã được tạo nhưng chưa có nội dung trả lời đủ để đánh giá."],
    weaknesses: [
      "Ứng viên chưa cung cấp câu trả lời, nên chưa thể xác định năng lực thực tế.",
      "Cần thực hiện lại phỏng vấn với phần trả lời đầy đủ hơn.",
    ],
    detailed_review: details,
    summary: "Không có dữ liệu trả lời để chấm điểm. Đề xuất: Cần phỏng vấn lại.",
  };
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

  const pairs = extractQuestionAnswerPairs(transcript);

  const batchProviders = [
    batchEvaluateWithOpenAI,
    batchEvaluateWithGemini,
    batchEvaluateWithClaude,
  ];

  for (const tryBatch of batchProviders) {
    try {
      const result = await tryBatch(pairs, context);
      if (!result) {
        continue;
      }

      const normalized = normalizeBatchResult(result.raw, pairs, context);
      if (!normalized) {
        continue;
      }

      const detailedReview = buildDetailedReview(pairs, normalized.perQuestion);

      return {
        provider: result.provider,
        evaluation: {
          score: normalized.overallScore,
          strengths: normalized.strengths.length >= 2
            ? normalized.strengths
            : buildFallbackStrengths(detailedReview),
          weaknesses: normalized.weaknesses.length >= 2
            ? normalized.weaknesses
            : buildFallbackWeaknesses(detailedReview),
          detailed_review: detailedReview,
          summary: normalized.summary,
        },
      };
    } catch (error) {
      console.error("Batch evaluation failed for provider, trying next:", error);
    }
  }

  const fallbackResults = pairs.map((pair) =>
    normalizeStrictAnswer(null, pair, context),
  );
  const detailedReview = buildDetailedReview(pairs, fallbackResults);
  const overallScore = computeFallbackScore(fallbackResults);

  return {
    provider: "fallback",
    evaluation: {
      score: overallScore,
      strengths: buildFallbackStrengths(detailedReview),
      weaknesses: buildFallbackWeaknesses(detailedReview),
      detailed_review: detailedReview,
      summary: buildFallbackSummary(overallScore),
    },
  };
}

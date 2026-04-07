import "server-only";

import {
  generateGeminiContentWithKeyRotation,
  hasGeminiApiKeys,
} from "@/lib/interview/gemini-client";
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

interface ClaudeResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface CvEvaluationProviderResult {
  provider: AIProvider;
  evaluation: CvEvaluationResult;
}

type CareerTrack =
  | "software"
  | "data"
  | "marketing"
  | "sales"
  | "product"
  | "design"
  | "generic";

interface CvEvaluationContext {
  profile?: InterviewCandidateProfile;
  cvText: string;
  language: "vi" | "en";
  inferredTrack: CareerTrack;
  inferredLevel: string;
  detectedSkills: string[];
}

const STACK_HINTS: Array<{ label: string; keywords: string[] }> = [
  { label: "Next.js", keywords: ["next.js", "nextjs"] },
  { label: "React", keywords: ["react", "reactjs"] },
  { label: "TypeScript", keywords: ["typescript"] },
  { label: "JavaScript", keywords: ["javascript"] },
  { label: "Node.js", keywords: ["node", "nodejs", "express", "nestjs"] },
  { label: "Python", keywords: ["python", "django", "flask", "fastapi"] },
  { label: "Java", keywords: ["java", "spring"] },
  { label: "C#/.NET", keywords: ["c#", ".net", "asp.net"] },
  { label: "Go", keywords: ["golang", " go "] },
  { label: "SQL", keywords: ["sql", "postgres", "mysql", "sql server"] },
  { label: "MongoDB", keywords: ["mongodb"] },
  { label: "Redis", keywords: ["redis"] },
  { label: "Docker", keywords: ["docker"] },
  { label: "Kubernetes", keywords: ["kubernetes", "k8s"] },
  { label: "AWS", keywords: ["aws", "ec2", "lambda", "s3"] },
  { label: "GCP", keywords: ["gcp", "google cloud"] },
  { label: "Azure", keywords: ["azure"] },
  { label: "CI/CD", keywords: ["ci/cd", "github actions", "gitlab ci", "jenkins"] },
  { label: "Data Analysis", keywords: ["power bi", "tableau", "pandas", "numpy"] },
  { label: "SEO", keywords: ["seo"] },
  { label: "Google Ads", keywords: ["google ads", "adwords"] },
  { label: "Facebook Ads", keywords: ["facebook ads", "meta ads"] },
  { label: "TikTok Ads", keywords: ["tiktok ads"] },
  { label: "Content Marketing", keywords: ["content", "copywriting"] },
  { label: "CRM", keywords: ["crm", "hubspot", "salesforce"] },
  { label: "Sales Pipeline", keywords: ["pipeline", "lead", "prospect", "quota"] },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Lỗi không xác định";
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
    return 50;
  }

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function normalizeForComparison(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/.+#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) {
      continue;
    }

    const normalized = normalizeForComparison(cleaned);
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(cleaned);
  }

  return output;
}

function normalizeStringArray(
  input: unknown,
  fallback: string[],
  minItems: number,
  maxItems = 6,
): string[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized = uniqueStrings(
    input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  if (normalized.length < minItems) {
    return fallback;
  }

  return normalized.slice(0, maxItems);
}

function normalizeProjectBreakdown(
  input: unknown,
  fallback: CvEvaluationResult["project_breakdown"],
): CvEvaluationResult["project_breakdown"] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized = input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const projectOrExperience =
        typeof record.project_or_experience === "string"
          ? record.project_or_experience.trim()
          : "";
      const standoutPoints =
        typeof record.standout_points === "string"
          ? record.standout_points.trim()
          : "";
      const unclearPoints =
        typeof record.unclear_points === "string"
          ? record.unclear_points.trim()
          : "";

      if (!projectOrExperience || !standoutPoints || !unclearPoints) {
        return null;
      }

      return {
        project_or_experience: projectOrExperience,
        standout_points: standoutPoints,
        unclear_points: unclearPoints,
      };
    })
    .filter(
      (
        item,
      ): item is {
        project_or_experience: string;
        standout_points: string;
        unclear_points: string;
      } => item !== null,
    );

  if (normalized.length < 2) {
    return fallback;
  }

  return normalized.slice(0, 5);
}

function detectStackSignals(profile: InterviewCandidateProfile | undefined, cvText: string): string[] {
  const source = normalizeForComparison(
    [profile?.targetRole, profile?.highlights, cvText].filter(Boolean).join(" "),
  );

  const found: string[] = [];

  for (const hint of STACK_HINTS) {
    const matched = hint.keywords.some((keyword) => {
      const normalizedKeyword = normalizeForComparison(keyword);
      return source.includes(normalizedKeyword);
    });

    if (matched) {
      found.push(hint.label);
    }
  }

  return uniqueStrings(found).slice(0, 10);
}

function inferCareerTrack(profile: InterviewCandidateProfile | undefined, cvText: string): CareerTrack {
  const source = normalizeForComparison(
    [profile?.targetRole, profile?.highlights, cvText].filter(Boolean).join(" "),
  );

  const hasAny = (patterns: string[]): boolean =>
    patterns.some((pattern) => source.includes(pattern));

  if (hasAny(["marketing", "seo", "content", "brand", "campaign", "ads"])) {
    return "marketing";
  }

  if (hasAny(["sales", "business development", "account executive", "quota", "pipeline"])) {
    return "sales";
  }

  if (hasAny(["data analyst", "data engineer", "machine learning", "power bi", "tableau", "sql", "pandas", "ai"])) {
    return "data";
  }

  if (hasAny(["product manager", "product owner", "roadmap", "backlog"])) {
    return "product";
  }

  if (hasAny(["ux", "ui", "figma", "visual design", "graphic design"])) {
    return "design";
  }

  if (hasAny(["developer", "engineer", "frontend", "backend", "fullstack", "react", "node", "java", "python", "devops"])) {
    return "software";
  }

  return "generic";
}

function inferCurrentLevel(profile: InterviewCandidateProfile | undefined, cvText: string): string {
  const source = normalizeForComparison([profile?.highlights, cvText].filter(Boolean).join(" "));
  const matches = Array.from(source.matchAll(/(\d+)\+?\s*(?:nam|year|years)/g));

  const maxYears = matches.reduce((currentMax, match) => {
    const raw = Number(match[1]);
    return Number.isFinite(raw) ? Math.max(currentMax, raw) : currentMax;
  }, 0);

  if (maxYears >= 5) {
    return "Trung cấp - Cao";
  }

  if (maxYears >= 2) {
    return "Junior - Trung cấp";
  }

  return "Fresher - Junior";
}

function prependTargetRole(baseRoles: string[], profile?: InterviewCandidateProfile): string[] {
  const targetRole = profile?.targetRole?.trim();

  if (!targetRole) {
    return uniqueStrings(baseRoles).slice(0, 3);
  }

  return uniqueStrings([targetRole, ...baseRoles]).slice(0, 3);
}

function buildRecommendedRoleFallback(context: CvEvaluationContext): string[] {
  const skillsNormalized = normalizeForComparison(context.detectedSkills.join(" "));

  const hasFrontend =
    skillsNormalized.includes("react") || skillsNormalized.includes("next.js");
  const hasBackend =
    skillsNormalized.includes("node.js") ||
    skillsNormalized.includes("python") ||
    skillsNormalized.includes("java") ||
    skillsNormalized.includes("c#/.net");

  switch (context.inferredTrack) {
    case "software": {
      if (hasFrontend && hasBackend) {
        return prependTargetRole(
          ["Lập trình viên Fullstack", "Lập trình viên Backend", "Lập trình viên Frontend"],
          context.profile,
        );
      }

      if (hasFrontend) {
        return prependTargetRole(
          ["Lập trình viên Frontend", "Kỹ sư giao diện Web", "Lập trình viên Fullstack"],
          context.profile,
        );
      }

      if (hasBackend) {
        return prependTargetRole(
          ["Lập trình viên Backend", "Kỹ sư API", "Lập trình viên Fullstack"],
          context.profile,
        );
      }

      return prependTargetRole(
        ["Kỹ sư phần mềm", "Lập trình viên Junior", "Kỹ sư QA Automation"],
        context.profile,
      );
    }
    case "data":
      return prependTargetRole(["Chuyên viên Phân tích dữ liệu", "Chuyên viên BI", "Kỹ sư dữ liệu"], context.profile);
    case "marketing":
      return prependTargetRole(
        ["Chuyên viên Digital Marketing", "Chuyên viên Performance Marketing", "Chuyên viên Content Marketing"],
        context.profile,
      );
    case "sales":
      return prependTargetRole(["Chuyên viên Kinh doanh", "Chuyên viên Phát triển kinh doanh", "Quản lý Khách hàng"], context.profile);
    case "product":
      return prependTargetRole(["Chủ sản phẩm", "Quản lý sản phẩm", "Chuyên viên phân tích nghiệp vụ"], context.profile);
    case "design":
      return prependTargetRole(["Nhà thiết kế UI/UX", "Nhà thiết kế sản phẩm", "Nhà thiết kế thị giác"], context.profile);
    default:
      return prependTargetRole(
        ["Chuyên viên tổng hợp", "Nhân sự tập sự", "Thực tập sinh"],
        context.profile,
      );
  }
}

function buildSkillGapSuggestions(context: CvEvaluationContext): string[] {
  const source = normalizeForComparison(
    [context.cvText, context.profile?.highlights].filter(Boolean).join(" "),
  );
  const gaps: string[] = [];

  if (!source.includes("metric") && !source.includes("kpi") && !source.includes("%")) {
    gaps.push("bổ sung số liệu đo lường cụ thể cho từng dự án hoặc chiến dịch");
  }

  if (
    context.inferredTrack === "software" &&
    !source.includes("testing") &&
    !source.includes("unit test")
  ) {
    gaps.push("làm rõ chiến lược kiểm thử và trách nhiệm chất lượng");
  }

  if (
    context.inferredTrack === "software" &&
    !source.includes("docker") &&
    !source.includes("aws") &&
    !source.includes("deploy")
  ) {
    gaps.push("thể hiện thêm kinh nghiệm triển khai hoặc vận hành production");
  }

  if (context.inferredTrack === "marketing" && !source.includes("a/b")) {
    gaps.push("bổ sung bằng chứng về A/B testing và tối ưu chuyển đổi");
  }

  if (context.inferredTrack === "sales" && !source.includes("crm")) {
    gaps.push("làm rõ quy trình CRM và quyền sở hữu pipeline");
  }

  if (gaps.length === 0) {
    gaps.push("làm rõ phần việc cá nhân thay vì chỉ liệt kê công cụ");
  }

  return gaps.slice(0, 3);
}

function buildRoleAlignmentFallback(
  context: CvEvaluationContext,
  recommendedRoles: string[],
): string {
  const trackLabelMap: Record<CareerTrack, string> = {
    software: "kỹ thuật phần mềm",
    data: "dữ liệu",
    marketing: "marketing",
    sales: "kinh doanh/phát triển kinh doanh",
    product: "sản phẩm",
    design: "thiết kế",
    generic: "tổng hợp",
  };

  const stackText =
    context.detectedSkills.length > 0
      ? context.detectedSkills.join(", ")
      : "chưa thấy tín hiệu nền tảng kỹ năng rõ ràng";

  const gaps = buildSkillGapSuggestions(context);

  return [
    `Hồ sơ hiện nghiêng về nhóm nghề ${trackLabelMap[context.inferredTrack]} ở mức khoảng ${context.inferredLevel}.`,
    `Nền tảng kỹ năng nổi bật: ${stackText}.`,
    `Vai trò phù hợp nhất gồm ${recommendedRoles.join(", ")} vì bám trực tiếp vào nền tảng kỹ năng trong CV, không phải gợi ý chung chung.`,
    `Để tăng độ tin cậy tuyển dụng, ứng viên nên: ${gaps.join("; ")}.`,
  ].join(" ");
}

function buildProjectBreakdownFallback(
  context: CvEvaluationContext,
): CvEvaluationResult["project_breakdown"] {
  const role = context.profile?.targetRole?.trim() || "vai trò mục tiêu";

  return [
    {
      project_or_experience: "Dự án trọng điểm #1",
      standout_points:
        "CV có nêu được bối cảnh công việc và một số công nghệ đã sử dụng.",
      unclear_points:
        `CV chưa tách bạch rõ phần việc cá nhân, phạm vi module phụ trách và tác động đo lường cho vai trò ${role}.`,
    },
    {
      project_or_experience: "Dự án trọng điểm #2",
      standout_points:
        "Có tín hiệu triển khai thực tế thay vì chỉ nêu lý thuyết.",
      unclear_points:
        "Lập luận về quyết định kiến trúc và đánh đổi còn mơ hồ, chưa đủ để xác thực mức năng lực hiện tại.",
    },
  ];
}

function buildSystemPrompt(context: CvEvaluationContext): string {
  const role = context.profile?.targetRole?.trim() || "vị trí ứng tuyển";

  return [
    `Bạn là một chuyên gia tuyển dụng có 15 năm kinh nghiệm trong lĩnh vực ${context.inferredTrack === "software" ? "công nghệ phần mềm" : context.inferredTrack === "marketing" ? "marketing" : context.inferredTrack === "data" ? "dữ liệu" : context.inferredTrack === "sales" ? "kinh doanh" : "nhân sự"}. Bạn đang xem CV cho vị trí ${role}.`,
    "",
    "NHIỆM VỤ: Đánh giá CV này như thể bạn đang quyết định có mời ứng viên đến phỏng vấn hay không.",
    "",
    "YÊU CẦU CHI TIẾT CHO TỪNG FIELD:",
    "",
    "1) score (0-100): Điểm tổng thể.",
    "   - 0-30: CV yếu, thiếu thông tin quan trọng, không đủ cơ sở để mời phỏng vấn.",
    "   - 31-50: CV tạm được, có vài tín hiệu nhưng thiếu chiều sâu.",
    "   - 51-70: CV khá, có kinh nghiệm liên quan nhưng cần xác minh qua phỏng vấn.",
    "   - 71-85: CV tốt, bằng chứng rõ ràng về năng lực phù hợp.",
    "   - 86-100: CV xuất sắc, ứng viên mạnh cần ưu tiên phỏng vấn.",
    "",
    "2) strengths (2-4 items): Điểm mạnh CỤ THỂ rút ra từ CV, PHẢI dẫn chứng (ví dụ: 'Có 2 năm kinh nghiệm thực tế với React và TypeScript tại dự án X').",
    "",
    "3) weaknesses (2-4 items): Điểm yếu CỤ THỂ, không nhận xét chung chung. Ví dụ: 'CV không nêu kết quả đo lường ở bất kỳ dự án nào' thay vì 'Cần cải thiện'.",
    "",
    "4) role_alignment (1-3 items): Mức phù hợp với vị trí, nêu rõ kỹ năng nào match và kỹ năng nào thiếu.",
    "",
    "5) interview_focus (2-3 items): Những điểm cần đào sâu trong phỏng vấn, viết dưới dạng hướng dẫn cho người phỏng vấn.",
    "",
    "6) recommended_roles: Đúng 3 vai trò PHÙ HỢP NHẤT dựa trên kỹ năng THỰC TẾ trong CV.",
    "",
    "7) role_alignment_analysis: Phân tích 3-5 câu, bao gồm: nhóm nghề phù hợp, mức năng lực ước tính, khoảng trống kỹ năng so với yêu cầu vị trí, và đề xuất cụ thể.",
    "",
    "8) project_breakdown (2-4 items): Phân tích từng dự án/kinh nghiệm nổi bật trong CV. Mỗi mục PHẢI có:",
    "   - project_or_experience: tên dự án/kinh nghiệm",
    "   - standout_points: điểm nổi bật CỤ THỂ",
    "   - unclear_points: điểm CHƯA RÕ mà phỏng vấn cần hỏi thêm",
    "",
    "9) red_flags (2-4 items): Cờ đỏ tuyển dụng — những dấu hiệu đáng lo ngại (gap trong kinh nghiệm, mô tả quá chung chung, thiếu số liệu, v.v.).",
    "",
    "10) drill_down_questions: Đúng 3 câu hỏi phỏng vấn hóc búa RÚT RA TỪ CV, nhắm vào điểm chưa rõ hoặc cờ đỏ.",
    "",
    "11) summary: 2-3 câu nhận xét tổng kết, bao gồm kết luận nên/không nên mời phỏng vấn và lý do.",
    "",
    "NGUYÊN TẮC:",
    "- Đánh giá dựa trên BẰNG CHỨNG trong CV, không suy diễn.",
    "- Chấm thẳng tay, không nương nhẹ vì CV mỏng.",
    "- Toàn bộ nội dung trả về bằng tiếng Việt có dấu.",
    "",
    "Trả về DUY NHẤT JSON hợp lệ theo schema yêu cầu.",
  ].join("\n");
}

function buildUserPayload(context: CvEvaluationContext): string {
  return JSON.stringify({
    language: "vi",
    profile: context.profile,
    inferred_track_from_parser: context.inferredTrack,
    inferred_level_from_parser: context.inferredLevel,
    detected_stack_signals: context.detectedSkills,
    cv_text_excerpt: context.cvText.slice(0, 10000),
  });
}

function normalizeRecommendedRoles(rawValue: unknown, fallback: string[]): string[] {
  const normalized = Array.isArray(rawValue)
    ? uniqueStrings(
        rawValue
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      )
    : [];

  return uniqueStrings([...normalized, ...fallback]).slice(0, 3);
}

function normalizeRoleAlignmentAnalysis(
  rawValue: unknown,
  fallback: string,
  recommendedRoles: string[],
): string {
  if (typeof rawValue !== "string") {
    return fallback;
  }

  const cleaned = rawValue.trim();
  if (cleaned.length < 40) {
    return fallback;
  }

  const containsAnyRole = recommendedRoles.some((role) =>
    normalizeForComparison(cleaned).includes(normalizeForComparison(role)),
  );

  if (!containsAnyRole) {
    return `${cleaned} Vai trò ưu tiên: ${recommendedRoles.join(", ")}.`;
  }

  return cleaned;
}

function createNoDataEvaluation(context: CvEvaluationContext): CvEvaluationResult {
  const recommendedRoles = buildRecommendedRoleFallback(context);
  const roleAlignmentAnalysis = buildRoleAlignmentFallback(context, recommendedRoles);

  return {
    score: 18,
    strengths: [
      "Đã có thông tin hồ sơ cơ bản.",
      "Có ngữ cảnh vai trò mục tiêu để định hướng đánh giá.",
    ],
    weaknesses: [
      "Không có đủ nội dung CV hữu ích để đánh giá năng lực thực tế.",
      "Thiếu chi tiết dự án, phạm vi sở hữu công việc và kết quả đo lường.",
    ],
    role_alignment: ["Chưa đủ bằng chứng để kết luận mức độ phù hợp vai trò."],
    interview_focus: [
      "Yêu cầu ứng viên mô tả 2 dự án gần nhất theo bối cảnh - hành động - kết quả.",
      "Xác minh phần việc cá nhân và cách ra quyết định.",
      "Yêu cầu số liệu cụ thể để kiểm chứng tác động.",
    ],
    recommended_roles: recommendedRoles,
    role_alignment_analysis: roleAlignmentAnalysis,
    project_breakdown: buildProjectBreakdownFallback(context),
    red_flags: [
      "Bằng chứng trong CV quá mỏng để đưa ra quyết định tuyển dụng đáng tin cậy.",
      "Dữ liệu hiện tại chưa xác thực được level thực chiến.",
    ],
    drill_down_questions: [
      "Chọn một dự án gần nhất và mô tả phần việc bạn trực tiếp sở hữu từ đầu đến cuối.",
      "Tình huống đánh đổi khó nhất bạn từng xử lý là gì và vì sao bạn chọn phương án đó?",
      "Chỉ số nào chứng minh rõ nhất tác động của bạn sau khi triển khai?",
    ],
    summary:
      "Dữ liệu CV hiện tại còn quá yếu để kết luận mức độ phù hợp vai trò một cách đáng tin cậy.",
  };
}

function normalizeEvaluation(raw: unknown, context: CvEvaluationContext): CvEvaluationResult {
  const role = context.profile?.targetRole || "vai trò mục tiêu";
  const recommendedRolesFallback = buildRecommendedRoleFallback(context);
  const roleAnalysisFallback = buildRoleAlignmentFallback(
    context,
    recommendedRolesFallback,
  );

  const strengthsFallback = [
    "CV có tín hiệu ban đầu liên quan đến vai trò mục tiêu.",
    "Có đủ chất liệu để xây bộ câu hỏi phỏng vấn đào sâu.",
  ];

  const weaknessesFallback = [
    "Bằng chứng về tác động đo lường còn yếu.",
    "Phạm vi sở hữu công việc chưa đủ rõ để xác nhận level.",
    "Nhiều mô tả đang thiên về liệt kê công cụ hơn là kết quả đầu ra.",
  ];

  const roleAlignmentFallback = [
    `Hồ sơ có mức phù hợp một phần với ${role}, nhưng cần phỏng vấn sâu để xác thực năng lực thực chiến.`,
  ];

  const focusFallback = [
    "Đào sâu dự án có tác động cao nhất để xác thực quyền sở hữu công việc.",
    "Khai thác rõ các quyết định kỹ thuật hoặc quyết định nghiệp vụ có yếu tố đánh đổi.",
    "Yêu cầu số liệu cứng thay vì mô tả chung chung.",
  ];

  const projectFallback = buildProjectBreakdownFallback(context);

  const redFlagsFallback = [
    "Nhiều thành tựu chưa đi kèm số liệu định lượng.",
    "Ranh giới trách nhiệm cá nhân còn mơ hồ ở các dự án quan trọng.",
  ];

  const drillDownFallback = [
    "Trong dự án quan trọng nhất, bạn trực tiếp sở hữu hạng mục nào từ đầu đến cuối?",
    "Bạn đã từng cân bằng giữa tốc độ và chất lượng ra sao trong một quyết định cụ thể?",
    "Đưa ra một chỉ số cụ thể chứng minh tác động bạn tạo ra.",
  ];

  const summaryFallback =
    "CV có tiềm năng, nhưng độ tin cậy về mức phù hợp vai trò còn hạn chế do thiếu bằng chứng chất lượng.";

  if (!raw || typeof raw !== "object") {
    return {
      score: 52,
      strengths: strengthsFallback,
      weaknesses: weaknessesFallback,
      role_alignment: roleAlignmentFallback,
      interview_focus: focusFallback,
      recommended_roles: recommendedRolesFallback,
      role_alignment_analysis: roleAnalysisFallback,
      project_breakdown: projectFallback,
      red_flags: redFlagsFallback,
      drill_down_questions: drillDownFallback,
      summary: summaryFallback,
    };
  }

  const record = raw as Record<string, unknown>;
  const recommendedRoles = normalizeRecommendedRoles(
    record.recommended_roles,
    recommendedRolesFallback,
  );

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, strengthsFallback, 2),
    weaknesses: normalizeStringArray(record.weaknesses, weaknessesFallback, 2),
    role_alignment: normalizeStringArray(record.role_alignment, roleAlignmentFallback, 1),
    interview_focus: normalizeStringArray(record.interview_focus, focusFallback, 2),
    recommended_roles: recommendedRoles,
    role_alignment_analysis: normalizeRoleAlignmentAnalysis(
      record.role_alignment_analysis,
      roleAnalysisFallback,
      recommendedRoles,
    ),
    project_breakdown: normalizeProjectBreakdown(record.project_breakdown, projectFallback),
    red_flags: normalizeStringArray(record.red_flags, redFlagsFallback, 2),
    drill_down_questions: normalizeStringArray(
      record.drill_down_questions,
      drillDownFallback,
      3,
      3,
    ),
    summary:
      typeof record.summary === "string" && record.summary.trim().length > 0
        ? record.summary.trim()
        : summaryFallback,
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

async function callOpenAI(context: CvEvaluationContext): Promise<CvEvaluationProviderResult | null> {
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
    return null;
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return null;
  }

  return {
    provider: "openai",
    evaluation: normalizeEvaluation(safeJsonParse(content), context),
  };
}

async function callGemini(context: CvEvaluationContext): Promise<CvEvaluationProviderResult | null> {
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
        temperature: 0.35,
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
      evaluation: normalizeEvaluation(safeJsonParse(content), context),
    };
  }

  return null;
}

async function callClaude(context: CvEvaluationContext): Promise<CvEvaluationProviderResult | null> {
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
      max_tokens: 1600,
      temperature: 0.35,
      system: buildSystemPrompt(context),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPayload(context),
            },
          ],
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

  return {
    provider: "claude",
    evaluation: normalizeEvaluation(safeJsonParse(content), context),
  };
}

export async function evaluateCvWithAI(
  profile: InterviewCandidateProfile | undefined,
  cvText: string,
  language: "vi" | "en" = "vi",
): Promise<CvEvaluationProviderResult> {
  const normalizedCvText = cvText.trim();
  const context: CvEvaluationContext = {
    profile,
    cvText: normalizedCvText,
    language,
    inferredTrack: inferCareerTrack(profile, normalizedCvText),
    inferredLevel: inferCurrentLevel(profile, normalizedCvText),
    detectedSkills: detectStackSignals(profile, normalizedCvText),
  };

  if (!normalizedCvText && !profile?.highlights?.trim()) {
    return {
      provider: "fallback",
      evaluation: createNoDataEvaluation(context),
    };
  }

  try {
    const openAIResult = await callOpenAI(context);
    if (openAIResult) {
      return openAIResult;
    }
  } catch (error) {
    console.warn("Không dùng được OpenAI cho CV, chuyển provider khác.", {
      reason: toErrorMessage(error),
    });
  }

  try {
    const geminiResult = await callGemini(context);
    if (geminiResult) {
      return geminiResult;
    }
  } catch (error) {
    console.warn("Không dùng được Gemini cho CV, chuyển provider khác.", {
      reason: toErrorMessage(error),
    });
  }

  try {
    const claudeResult = await callClaude(context);
    if (claudeResult) {
      return claudeResult;
    }
  } catch (error) {
    console.warn("Không dùng được Claude cho CV, dùng fallback.", {
      reason: toErrorMessage(error),
    });
  }

  return {
    provider: "fallback",
    evaluation: normalizeEvaluation(null, context),
  };
}

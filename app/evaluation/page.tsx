import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  UserRound,
} from "lucide-react";

const evaluation = {
  candidateName: "Nguyen Minh Anh",
  position: "Senior Frontend Engineer",
  overallScore: 86,
  strengths: [
    "Kinh nghiệm Next.js và React rõ ràng, trình bày dự án có số liệu đo lường cụ thể.",
    "Mô tả tốt các kỹ năng tối ưu hiệu năng giao diện và cải thiện Core Web Vitals.",
    "Portfolio thể hiện tư duy sản phẩm và khả năng phối hợp cùng team Design.",
    "CV có cấu trúc gọn, dễ quét, nổi bật ở phần thành tựu định lượng.",
  ],
  risks: [
    "Thiếu ví dụ chuyên sâu về kiến trúc state management ở quy mô enterprise.",
    "Chưa thể hiện rõ kinh nghiệm mentoring hoặc dẫn dắt kỹ thuật trong đội ngũ lớn.",
    "Một số công nghệ trong JD (testing E2E, observability) chưa được mô tả nổi bật.",
    "Nên bổ sung thêm kinh nghiệm làm việc với quy trình bảo mật frontend.",
  ],
  summary:
    "CV cho thấy ứng viên có nền tảng frontend rất tốt, tư duy sản phẩm rõ ràng và khả năng triển khai UI chất lượng cao. Nếu thể hiện rõ hơn về kinh nghiệm kiến trúc hệ thống và vai trò leadership, hồ sơ sẽ cạnh tranh mạnh cho vòng phỏng vấn kỹ thuật sâu.",
};

export default function EvaluationPage() {
  const scoreAngle = evaluation.overallScore * 3.6;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 pb-6">
      <header className="animate-fade-in-up rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          CV Evaluation Dashboard
        </p>

        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-32 w-32 sm:h-36 sm:w-36">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(rgba(56,189,248,0.95) ${scoreAngle}deg, rgba(203,213,225,0.45) ${scoreAngle}deg)`,
                }}
              />
              <div className="absolute inset-[10px] rounded-full border border-white/80 bg-white/80 backdrop-blur-xl" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-900">
                <span className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold">
                  {evaluation.overallScore}%
                </span>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Overall
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-slate-900 sm:text-3xl">
                Đánh Giá CV
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                AI đã phân tích nội dung CV và tóm tắt các điểm mạnh, rủi ro và mức độ phù hợp với vị trí ứng tuyển.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:w-auto">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <UserRound className="h-4 w-4 text-sky-600" />
              <span className="font-medium text-slate-900">{evaluation.candidateName}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <BriefcaseBusiness className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-slate-900">{evaluation.position}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid animate-fade-in-up gap-6 [animation-delay:120ms] [animation-fill-mode:both] lg:grid-cols-2">
        <article className="rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            Điểm mạnh
          </div>

          <ul className="mt-5 space-y-4">
            {evaluation.strengths.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cần cải thiện / Rủi ro
          </div>

          <ul className="mt-5 space-y-4">
            {evaluation.risks.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <section className="animate-fade-in-up rounded-3xl border border-white/80 bg-white/65 p-6 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] [animation-delay:220ms] [animation-fill-mode:both] sm:p-8">
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900 sm:text-2xl">
          Nhận xét tổng quan từ AI
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          {evaluation.summary}
        </p>

        <div className="mt-8 rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-100/70 via-white/80 to-rose-100/70 p-3 shadow-[0_14px_32px_rgba(59,130,246,0.16)] sm:p-4">
          <Link
            href="/interview"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 px-6 py-4 text-base font-semibold text-white transition-transform duration-300 hover:scale-[1.01] sm:text-lg"
          >
            Bắt đầu Phỏng vấn
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </section>
  );
}
import { InterviewPanel } from "@/components/ui/interview-panel";

export default function InterviewPage() {
  return (
    <section className="flex flex-1 flex-col justify-center pb-4">
      <div className="animate-fade-in-up mb-5 px-1 sm:px-2 [animation-delay:80ms] [animation-fill-mode:both]">
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-white sm:text-3xl">
          AI Interview Session
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Mô phỏng hội thoại thời gian thực với dữ liệu giả lập để kiểm tra UI.
        </p>
      </div>

      <div className="animate-fade-in-up [animation-delay:200ms] [animation-fill-mode:both]">
        <InterviewPanel />
      </div>
    </section>
  );
}

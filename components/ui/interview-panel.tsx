"use client";

import { ChatBubble } from "@/components/ui/chat-bubble";
import { ChatComposer } from "@/components/ui/chat-composer";
import { Clock3, FileBadge2, ListChecks, OctagonX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const messages = [
  {
    role: "ai" as const,
    timestamp: "09:01",
    message:
      "Xin chào! Hãy giới thiệu ngắn gọn về bản thân và lý do bạn quan tâm vị trí Frontend Engineer.",
  },
  {
    role: "user" as const,
    timestamp: "09:02",
    message:
      "Em là một Frontend Engineer với 4 năm kinh nghiệm React/Next.js, tập trung vào hiệu năng UI và trải nghiệm người dùng.",
  },
  {
    role: "ai" as const,
    timestamp: "09:03",
    message:
      "Tuyệt vời. Bạn đã từng tối ưu một màn hình có nhiều dữ liệu realtime như thế nào để vẫn giữ FPS ổn định?",
  },
  {
    role: "user" as const,
    timestamp: "09:04",
    message:
      "Em dùng virtualization, debounce các cập nhật không quan trọng và tách component để giảm re-render theo vùng.",
  },
  {
    role: "ai" as const,
    timestamp: "09:05",
    message:
      "Nếu được chọn, bạn sẽ đo lường thành công của trải nghiệm phỏng vấn AI bằng những chỉ số nào?",
  },
];

export function InterviewPanel() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  return (
    <section className="mx-auto w-full max-w-[1280px] lg:h-[calc(100vh-10rem)]">
      <div className="grid h-auto gap-5 lg:h-full lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <div className="flex min-h-[540px] flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:h-full">
          <header className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Live Interview
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-slate-900 sm:text-2xl">
                Frontend Engineer Session
              </h2>
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Recording
            </span>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
            {messages.map((item, index) => (
              <ChatBubble
                key={`${item.role}-${index}`}
                role={item.role}
                message={item.message}
                timestamp={item.timestamp}
              />
            ))}
          </div>

          <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
            <ChatComposer />
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border border-white/80 bg-white/60 p-5 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6 lg:h-full">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Clock3 className="h-4 w-4 text-sky-600" />
              Thời gian phỏng vấn
            </p>
            <p className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-bold text-slate-900">
              {formattedTimer}
            </p>
            <p className="mt-2 text-sm text-slate-500">Phiên đang diễn ra ổn định, âm thanh và transcript đang được ghi nhận.</p>
          </div>

          <div className="flex-1 rounded-2xl border border-white/80 bg-white/70 p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <FileBadge2 className="h-4 w-4 text-indigo-600" />
              Tóm tắt CV
            </p>

            <h3 className="mt-3 font-semibold text-slate-900">Nguyen Minh Anh</h3>
            <p className="text-sm text-slate-500">Senior Frontend Engineer</p>

            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                React, Next.js, TypeScript, tối ưu Core Web Vitals.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                4+ năm kinh nghiệm xây dựng UI scale lớn.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-600">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                Mạnh về performance tuning và collaboration với Product/Design.
              </li>
            </ul>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
          >
            <OctagonX className="h-4 w-4" />
            Kết thúc phỏng vấn
          </button>
        </aside>
      </div>
    </section>
  );
}

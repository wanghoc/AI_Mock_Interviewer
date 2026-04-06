import { Bot, UserRound } from "lucide-react";

type ChatRole = "ai" | "user";

interface ChatBubbleProps {
  role: ChatRole;
  message: string;
  timestamp: string;
}

export function ChatBubble({ role, message, timestamp }: ChatBubbleProps) {
  const isAi = role === "ai";

  return (
    <div className={`flex w-full ${isAi ? "justify-start" : "justify-end"}`}>
      <div className={`flex max-w-[90%] items-end gap-3 ${isAi ? "" : "flex-row-reverse"}`}>
        {isAi ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-indigo-100 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.2)]">
            <Bot className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-200 bg-blue-100 text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.18)]">
            <UserRound className="h-4 w-4" />
          </div>
        )}

        <div
          className={
            isAi
              ? "rounded-2xl rounded-bl-md border border-white/90 bg-white/80 px-4 py-3 text-sm leading-relaxed text-slate-700 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
              : "rounded-2xl rounded-br-md border border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-indigo-50/80 px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-[0_8px_24px_rgba(59,130,246,0.12)]"
          }
        >
          <div className="mb-1.5 flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.12em]">
            <span className={isAi ? "font-semibold text-sky-700" : "font-semibold text-blue-700"}>
              {isAi ? "AI Interviewer" : "You"}
            </span>
            <span className="text-slate-400">{timestamp}</span>
          </div>
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
}

import { Sparkles, UserRound } from "lucide-react";

type ChatRole = "ai" | "user";

interface ChatBubbleProps {
  role: ChatRole;
  message: string;
}

export function ChatBubble({ role, message }: ChatBubbleProps) {
  const isAi = role === "ai";

  return (
    <div className={`flex w-full ${isAi ? "justify-start" : "justify-end"}`}>
      <div className={`flex max-w-[85%] items-end gap-3 ${isAi ? "" : "flex-row-reverse"}`}>
        {isAi ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.35)]">
            <Sparkles className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white">
            <UserRound className="h-4 w-4" />
          </div>
        )}

        <div
          className={
            isAi
              ? "rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-100 backdrop-blur-md"
              : "rounded-2xl rounded-br-md border border-indigo-300/40 bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3 text-sm leading-relaxed text-white shadow-[0_8px_24px_rgba(79,70,229,0.35)]"
          }
        >
          {message}
        </div>
      </div>
    </div>
  );
}

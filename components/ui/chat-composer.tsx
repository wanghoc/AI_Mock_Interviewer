"use client";

import { FormEvent, useState } from "react";
import { Mic, Paperclip, SendHorizonal } from "lucide-react";

export function ChatComposer() {
  const [draft, setDraft] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setDraft("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 backdrop-blur-2xl shadow-[0_14px_32px_rgba(15,23,42,0.08)] sm:px-4"
    >
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
        aria-label="Gắn kèm file"
      >
        <Paperclip className="h-4 w-4" />
      </button>

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Nhập câu trả lời của bạn..."
        className="h-10 flex-1 bg-transparent px-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
      />

      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
        aria-label="Sử dụng micro"
      >
        <Mic className="h-4 w-4" />
      </button>

      <button
        type="submit"
        disabled={!draft.trim()}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 text-white shadow-[0_10px_26px_rgba(99,102,241,0.35)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Gửi tin nhắn"
      >
        <SendHorizonal className="h-4 w-4" />
      </button>
    </form>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { Mic, Paperclip, SendHorizonal } from "lucide-react";

export function ChatComposer() {
  const [draft, setDraft] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-lg shadow-[0_8px_32px_0_rgba(0,0,0,0.35)] sm:px-4"
    >
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
        aria-label="Gắn kèm file"
      >
        <Paperclip className="h-4 w-4" />
      </button>

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Nhập câu trả lời của bạn..."
        className="h-10 flex-1 bg-transparent px-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
      />

      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
        aria-label="Sử dụng micro"
      >
        <Mic className="h-4 w-4" />
      </button>

      <button
        type="submit"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.6)] transition-transform hover:scale-[1.03]"
        aria-label="Gửi tin nhắn"
      >
        <SendHorizonal className="h-4 w-4" />
      </button>
    </form>
  );
}

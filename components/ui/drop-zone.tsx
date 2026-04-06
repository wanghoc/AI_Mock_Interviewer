"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileText } from "lucide-react";

export function DropZone() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile("");
      return;
    }
    setSelectedFile(file.name);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl border p-10 text-center transition-all duration-300 sm:p-16 ${
          isDragging
            ? "border-fuchsia-300/80 bg-white/12 shadow-[0_0_30px_rgba(217,70,239,0.35)]"
            : "border-white/10 bg-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:border-cyan-300/70 hover:bg-white/10 hover:shadow-[0_0_34px_rgba(59,130,246,0.35)]"
        } backdrop-blur-xl`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="animate-soft-pulse mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-[0_0_28px_rgba(56,189,248,0.35)] transition-all duration-300 group-hover:shadow-[0_0_32px_rgba(236,72,153,0.4)]">
          <FileText className="h-10 w-10 text-cyan-200" />
        </div>

        <h3 className="text-xl font-semibold text-white sm:text-2xl">
          Kéo thả CV của bạn vào không gian này (PDF)
        </h3>
        <p className="mt-3 text-sm text-slate-300 sm:text-base">
          Hoặc bấm vào khung để chọn file từ thiết bị của bạn.
        </p>
      </div>

      {selectedFile ? (
        <div className="animate-fade-in-up mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
          <p className="text-sm text-slate-300">File đã chọn</p>
          <p className="mt-1 truncate text-base font-medium text-white">
            {selectedFile}
          </p>
          <Link
            href="/interview"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.55)] transition-transform duration-300 hover:scale-[1.02] hover:shadow-[0_0_36px_rgba(217,70,239,0.6)]"
          >
            Bắt đầu Phỏng vấn
          </Link>
        </div>
      ) : null}
    </div>
  );
}

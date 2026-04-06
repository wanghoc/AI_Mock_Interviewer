"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { INTERVIEW_STORAGE_KEYS } from "@/lib/interview/client-storage";

type AnalysisState = "idle" | "analyzing" | "ready";

export function DropZone() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisTimeoutRef = useRef<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [candidateName, setCandidateName] = useState("");
  const [targetRole, setTargetRole] = useState("Frontend Engineer");
  const [highlights, setHighlights] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.workflowStep, "cv-upload");
    }

    return () => {
      if (analysisTimeoutRef.current) {
        window.clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, []);

  const buildCandidateNameFromFile = (fileName: string) => {
    const cleaned = fileName
      .replace(/\.pdf$/i, "")
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || "Ứng viên";
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile("");
      setAnalysisState("idle");
      setErrorMessage("Hệ thống hiện chỉ hỗ trợ file PDF. Vui lòng thử lại.");
      return;
    }

    setErrorMessage("");
    setSelectedFile(file.name);
    setCandidateName((current) => current || buildCandidateNameFromFile(file.name));
    setAnalysisState("analyzing");

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(INTERVIEW_STORAGE_KEYS.transcript);
      window.sessionStorage.removeItem(INTERVIEW_STORAGE_KEYS.transcriptJson);
      window.sessionStorage.removeItem(INTERVIEW_STORAGE_KEYS.evaluation);
      window.sessionStorage.removeItem(INTERVIEW_STORAGE_KEYS.evaluationId);
      window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.status, "IN_PROGRESS");
    }

    if (analysisTimeoutRef.current) {
      window.clearTimeout(analysisTimeoutRef.current);
    }

    analysisTimeoutRef.current = window.setTimeout(() => {
      setAnalysisState("ready");
    }, 2200);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const persistCandidateProfile = () => {
    if (!selectedFile || typeof window === "undefined") {
      return;
    }

    const profile = {
      candidateName: candidateName.trim() || "Ứng viên",
      targetRole: targetRole.trim() || "Frontend Engineer",
      cvFileName: selectedFile,
      highlights: highlights.trim(),
    };

    window.sessionStorage.setItem(
      INTERVIEW_STORAGE_KEYS.candidateProfile,
      JSON.stringify(profile),
    );
    window.sessionStorage.setItem(INTERVIEW_STORAGE_KEYS.workflowStep, "cv-evaluation");
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
            ? "border-sky-300/90 bg-white/75 shadow-[0_12px_36px_rgba(14,116,144,0.16)]"
            : "border-white/80 bg-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-sky-200 hover:bg-white/70 hover:shadow-[0_14px_32px_rgba(59,130,246,0.12)]"
        } backdrop-blur-2xl`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="animate-soft-pulse mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-indigo-50 shadow-[0_10px_28px_rgba(59,130,246,0.16)] transition-all duration-300 group-hover:shadow-[0_14px_32px_rgba(236,72,153,0.18)]">
          <FileText className="h-10 w-10 text-sky-600" />
        </div>

        <h3 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          Kéo thả CV của bạn vào không gian này (PDF)
        </h3>
        <p className="mt-3 text-sm text-slate-500 sm:text-base">
          Hoặc bấm vào khung để chọn file từ thiết bị của bạn.
        </p>

        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-sky-200/60 to-rose-200/60 blur-2xl" />
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-600 backdrop-blur-xl">
          {errorMessage}
        </div>
      ) : null}

      {selectedFile ? (
        <div className="animate-fade-in-up mx-auto w-full max-w-xl rounded-2xl border border-white/80 bg-white/65 p-5 text-center backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <p className="text-sm text-slate-500">File đã chọn</p>
          <p className="mt-1 truncate text-base font-medium text-slate-900">
            {selectedFile}
          </p>

          <div className="mt-5 grid gap-3 text-left">
            <div>
              <label
                htmlFor="candidateName"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                Tên ứng viên
              </label>
              <input
                id="candidateName"
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                placeholder="Ví dụ: Nguyen Minh Anh"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
              />
            </div>

            <div>
              <label
                htmlFor="targetRole"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                Vị trí ứng tuyển
              </label>
              <input
                id="targetRole"
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                placeholder="Ví dụ: Frontend Engineer"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
              />
            </div>

            <div>
              <label
                htmlFor="highlights"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                Điểm nhấn CV (tuỳ chọn)
              </label>
              <textarea
                id="highlights"
                value={highlights}
                onChange={(event) => setHighlights(event.target.value)}
                rows={3}
                placeholder="Ví dụ: 4 năm React/Next.js, tối ưu hiệu năng, dẫn dắt UI team..."
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
              />
            </div>
          </div>

          {analysisState === "analyzing" ? (
            <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-sky-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang phân tích CV...
            </div>
          ) : null}

          {analysisState === "ready" ? (
            <Link
              href="/evaluation?mode=cv"
              onClick={persistCandidateProfile}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-400 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(99,102,241,0.32)] transition-transform duration-300 hover:scale-[1.02]"
            >
              <Sparkles className="h-4 w-4" />
              Xem đánh giá CV
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

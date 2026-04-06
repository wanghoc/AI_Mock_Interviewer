import { DropZone } from "@/components/ui/drop-zone";

export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-8 sm:py-10">
      <div className="animate-fade-in-up w-full max-w-5xl text-center [animation-delay:120ms] [animation-fill-mode:both]">
        <p className="mb-5 text-xs uppercase tracking-[0.22em] text-slate-400">
          Next Generation Interview Simulator
        </p>

        <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold leading-tight text-white sm:text-6xl">
          Trải nghiệm
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
            {" "}Phỏng vấn Tương lai
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Tải CV và bước vào một phiên mô phỏng phỏng vấn cùng AI với giao diện
          Liquid Glass tập trung vào trải nghiệm trực quan và cảm xúc.
        </p>
      </div>

      <div className="animate-fade-in-up mt-12 flex w-full justify-center [animation-delay:280ms] [animation-fill-mode:both]">
        <DropZone />
      </div>
    </section>
  );
}

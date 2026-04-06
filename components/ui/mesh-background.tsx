export function MeshBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
    >
      <div className="animate-drift-slow absolute left-[-10%] top-[-18%] h-[22rem] w-[22rem] rounded-full bg-sky-200/70 blur-[120px] sm:h-[30rem] sm:w-[30rem]" />
      <div className="animate-drift-medium absolute right-[-8%] top-[2%] h-[20rem] w-[20rem] rounded-full bg-violet-200/65 blur-[115px] sm:h-[27rem] sm:w-[27rem]" />
      <div className="animate-drift-fast absolute bottom-[-24%] left-[12%] h-[22rem] w-[22rem] rounded-full bg-rose-200/65 blur-[125px] sm:h-[31rem] sm:w-[31rem]" />
      <div className="animate-drift-medium absolute bottom-[-15%] right-[5%] h-[18rem] w-[18rem] rounded-full bg-amber-100/70 blur-[110px] sm:h-[25rem] sm:w-[25rem]" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.9)_0%,transparent_45%),radial-gradient(circle_at_80%_20%,rgba(191,219,254,0.35)_0%,transparent_46%),linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(241,245,249,0.9)_100%)]" />
      <div className="absolute inset-0 opacity-65 [background-image:linear-gradient(rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:58px_58px]" />
    </div>
  );
}

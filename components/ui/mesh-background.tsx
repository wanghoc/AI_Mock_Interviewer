export function MeshBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
    >
      <div className="animate-drift-slow absolute left-[-10%] top-[-15%] h-80 w-80 rounded-full bg-violet-600/30 blur-[120px] sm:h-[28rem] sm:w-[28rem]" />
      <div className="animate-drift-medium absolute right-[-12%] top-[8%] h-72 w-72 rounded-full bg-blue-600/30 blur-[120px] sm:h-[24rem] sm:w-[24rem]" />
      <div className="animate-drift-fast absolute bottom-[-18%] left-[15%] h-80 w-80 rounded-full bg-fuchsia-500/20 blur-[130px] sm:h-[30rem] sm:w-[30rem]" />
      <div className="animate-drift-medium absolute bottom-[10%] right-[5%] h-64 w-64 rounded-full bg-cyan-500/20 blur-[110px] sm:h-[22rem] sm:w-[22rem]" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.15),_rgba(2,6,23,0.9)_45%,_rgba(2,6,23,1)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.05)_0%,transparent_30%,transparent_70%,rgba(148,163,184,0.05)_100%)]" />
    </div>
  );
}

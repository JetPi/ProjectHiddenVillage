export function AppHydrateFallback() {
  return (
    <div className="grid h-dvh place-items-center bg-[#05070c] text-white">
      <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-[14px] font-semibold tracking-[0.02em]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
        <span>Loading...</span>
      </div>
    </div>
  )
}

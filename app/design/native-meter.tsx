/** Landscape native % meter (by plant count, edibles excluded), always visible in the studio header. */
export function NativeMeter({ pct, byArea, target }: { pct: number; byArea: number; target: number | null }) {
  const ok = target == null || pct >= target;
  return (
    <div className="min-w-64" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Landscape native plants by count">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Landscape native {Math.round(pct)}%</span>
        <span className="text-xs text-muted-foreground">{Math.round(byArea)}% of canopy{target != null && ` · goal ${target}%`}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden mt-1">
        <div className={`h-full rounded-full transition-all ${ok ? "bg-primary" : "bg-coral"}`} style={{ width: `${pct}%` }} />
        {target != null && <div className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${target}%` }} />}
      </div>
    </div>
  );
}

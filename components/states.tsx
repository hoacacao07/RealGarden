import { AlertTriangle, Loader2, Sprout } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-coral/50 bg-coral/5 p-4 text-sm flex gap-3 items-start">
      <AlertTriangle className="size-5 text-coral shrink-0 mt-0.5" aria-hidden />
      <div className="space-y-2">
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="underline font-medium">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
      <Sprout className="size-8 mx-auto text-leaf/60" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function UnverifiedBadge() {
  return (
    <Badge variant="outline" className="border-[oklch(0.75_0.13_70)] text-[oklch(0.42_0.09_60)] bg-[oklch(0.97_0.04_85)]"
      title="Values filled from general knowledge. Not yet checked against UF/IFAS, FNPS or the Atlas of Florida Plants.">
      Unverified data
    </Badge>
  );
}

export function EstimateNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground"><span className="font-medium">Estimate.</span> {children}</p>;
}

export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2" aria-label={`${label ?? "Fit score"} ${pct} out of 100`}>
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-8 text-right">{pct}</span>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, CloudLightning, CloudRain, Link2, Loader2, RefreshCw, Snowflake, Sun, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const ICON: Record<string, React.ReactNode> = {
  cold_snap: <Snowflake aria-hidden />, hurricane: <CloudLightning aria-hidden />, rainy_week: <CloudRain aria-hidden />, normal_week: <Sun aria-hidden />,
};

export function DashboardControls({ gardenId, scenario, scenarios }: {
  gardenId: string; scenario: string | null; scenarios: { name: string; title: string; description: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const go = (name: string | null) => {
    setBusy(name ?? "live");
    start(() => router.push(name ? `${path}?scenario=${name}` : path, { scroll: false }));
  };
  const refresh = () => { setBusy("refresh"); start(() => router.refresh()); };
  const copy = async () => {
    const url = `${window.location.origin}/garden/${gardenId}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this link", url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const spin = (k: string) => pending && busy === k;

  return (
    <div className="rounded-2xl border bg-card p-3 flex flex-wrap items-center gap-2">
      <Button onClick={refresh} disabled={pending}>
        {spin("refresh") ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Refresh
      </Button>
      <span className="text-sm text-muted-foreground ml-1 mr-1">Replay scenario:</span>
      <div role="group" aria-label="Replay a saved weather scenario" className="flex flex-wrap gap-1.5">
        {scenarios.map((s) => (
          <Button key={s.name} size="sm" variant={scenario === s.name ? "default" : "outline"} onClick={() => go(s.name)} disabled={pending}
            aria-pressed={scenario === s.name} title={s.description}>
            {spin(s.name) ? <Loader2 className="animate-spin" aria-hidden /> : ICON[s.name]} {s.title}
          </Button>
        ))}
        {scenario && (
          <Button size="sm" variant="ghost" onClick={() => go(null)} disabled={pending}><X aria-hidden /> Back to live</Button>
        )}
      </div>
      <Button variant="outline" className="ml-auto" onClick={copy}>
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />} {copied ? "Link copied" : "Copy share link"}
      </Button>
    </div>
  );
}

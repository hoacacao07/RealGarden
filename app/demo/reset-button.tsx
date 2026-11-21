"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KEY = "nativescape.demoToken";

/** Calls POST /api/demo/reset. The token is remembered in this browser only (a per-presenter convenience). */
export function ResetButton() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  useEffect(() => {
    try { const t = localStorage.getItem(KEY); if (t && input.current) input.current.value = t; } catch { /* storage blocked */ }
  }, []);

  async function reset() {
    const token = input.current?.value.trim() ?? "";
    if (!token) { setState({ kind: "err", msg: "Enter the reset token (DEMO_RESET_TOKEN)." }); return; }
    setState({ kind: "busy" });
    try { localStorage.setItem(KEY, token); } catch { /* storage blocked */ }
    try {
      const res = await fetch("/api/demo/reset", { method: "POST", headers: { "x-demo-token": token } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Reset failed");
      setState({ kind: "ok", msg: `Demo gardens reset at ${new Date(j.at).toLocaleTimeString()}` });
    } catch (e) {
      setState({ kind: "err", msg: (e as Error).message });
    }
  }

  return (
    <form className="rounded-2xl border bg-card p-3 space-y-2 w-full sm:w-auto" onSubmit={(e) => { e.preventDefault(); reset(); }}>
      <div className="flex gap-2">
        <Input ref={input} type="password" placeholder="Reset token" aria-label="Demo reset token" className="h-9 w-full sm:w-44" autoComplete="off" />
        <Button type="submit" disabled={state.kind === "busy"}>
          {state.kind === "busy" ? <Loader2 className="animate-spin" aria-hidden /> : state.kind === "ok" ? <Check aria-hidden /> : <RotateCcw aria-hidden />} Reset demo gardens
        </Button>
      </div>
      {state.msg && <p role="status" className={`text-xs ${state.kind === "err" ? "text-coral" : "text-muted-foreground"}`}>{state.msg}</p>}
    </form>
  );
}

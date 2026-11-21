"use client";

/** Floating "Ask Garden AI" button on every page (spec 7B.1). Opens the chat for the current garden in a panel. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Maximize2, Sparkles, X } from "lucide-react";

import { useCurrentGarden } from "@/components/site-chrome";
import { GardenChat } from "./chat";

export function ChatLauncher() {
  const path = usePathname();
  const g = useCurrentGarden();
  // The panel closes on navigation: it is open only on the page where it was opened.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  // Hidden on the full chat page, the presenter page and the 3D check page.
  if (path.endsWith("/assistant") || path.startsWith("/demo") || path.startsWith("/zz-")) return null;

  return (
    <div className="print:hidden">
      {open && (
        <div role="dialog" aria-label="Ask Garden AI"
          className="fixed z-[1002] bottom-20 right-4 left-4 sm:left-auto sm:w-[400px] h-[min(600px,calc(100vh-7rem))] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-3 py-2 bg-secondary/50">
            <p className="font-semibold flex items-center gap-2"><Sparkles className="size-4 text-primary" aria-hidden /> Ask Garden AI</p>
            <div className="flex items-center gap-1">
              {g && <Link href={`/garden/${g}/assistant`} aria-label="Open full page" className="p-1.5 rounded hover:bg-muted"><Maximize2 className="size-4" /></Link>}
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded hover:bg-muted"><X className="size-4" /></button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {g ? <GardenChat gardenId={g} compact /> : (
              <div className="p-4 space-y-3 text-sm">
                <p>Garden AI answers questions about <strong>your</strong> garden: plants, weather, alerts and tasks.</p>
                <Link href="/start" className="inline-block rounded-lg bg-primary text-primary-foreground px-3 py-2">Start my garden</Link>
              </div>
            )}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="fixed z-[1002] bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg px-4 py-3 text-sm font-medium hover:bg-primary/90">
        {open ? <X className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {open ? "Close" : "Ask Garden AI"}
      </button>
    </div>
  );
}

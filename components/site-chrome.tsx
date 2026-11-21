"use client";

/**
 * Top navigation (spec 2B): My Garden · Design · Shopping · Care · Ask AI, and More (Sustainable, Weather & soil
 * details, Plant catalog, Community map, Settings). No login: "my garden" is the last garden opened in this browser
 * (remembered in localStorage); without one, the garden links go to /start. The presenter page stays hidden.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

import { useLocalJson } from "@/lib/use-local";

export const CURRENT_GARDEN_KEY = "nsfl:garden";

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--leaf)" />
      <path d="M16 25V13" stroke="var(--sand)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 15c-1-5-5-7-9-6 1 4 4 7 9 6zM16 18c1-5 5-8 10-7-1 5-5 8-10 7z" fill="var(--sand)" />
      <path d="M6 24c3-2 6-2 10 0s7 2 10 0" stroke="var(--sky)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Garden id from the URL (/garden/<id>/...), else null. The design studio remembers its garden itself. */
function gardenInPath(path: string): string | null {
  return path.match(/^\/garden\/([a-z0-9_-]+)/i)?.[1] ?? null;
}

/** Remember a garden as "my garden" in this browser (design studio, Garden Starter). */
export function rememberGarden(id: string) {
  try { localStorage.setItem(CURRENT_GARDEN_KEY, JSON.stringify(id)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event("nsfl-local"));
}

export function useCurrentGarden(): string | null {
  const path = usePathname();
  const [saved, setSaved] = useLocalJson<string | null>(CURRENT_GARDEN_KEY, null);
  const here = gardenInPath(path);
  useEffect(() => { if (here && here !== saved) setSaved(here); }, [here, saved, setSaved]);
  return here ?? saved;
}

function navFor(g: string | null) {
  const at = (p: string) => (g ? p.replace("{g}", g) : "/start");
  return {
    main: [
      { href: at("/garden/{g}"), label: "My Garden", match: (p: string) => /^\/garden\/[^/]+$/.test(p) },
      { href: g ? `/design?garden=${g}` : "/design", label: "Design", match: (p: string) => p.startsWith("/design") },
      { href: at("/garden/{g}/plan?tab=shopping"), label: "Shopping", match: (p: string) => p.endsWith("/plan") },
      { href: at("/garden/{g}/care"), label: "Care", match: (p: string) => p.endsWith("/care") || p.endsWith("/alerts") },
      { href: at("/garden/{g}/assistant"), label: "Ask AI", match: (p: string) => p.endsWith("/assistant") },
    ],
    more: [
      { href: at("/garden/{g}/sustainable"), label: "🌱 Sustainable" },
      { href: at("/garden/{g}?more=weather#learn-more"), label: "Weather & soil details" },
      { href: "/plants", label: "Plant catalog" },
      { href: "/map", label: "Community map" },
      { href: "/settings", label: "Settings" },
      { href: "/start", label: "Start a new garden" },
    ],
  };
}

function More({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted inline-flex items-center gap-1" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        More <ChevronDown className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 rounded-xl border bg-card shadow-lg p-1 z-[1001]">
          {items.map((n) => (
            <Link key={n.href} role="menuitem" href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">{n.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const g = useCurrentGarden();
  const [open, setOpen] = useState(false);
  const nav = navFor(g);
  return (
    <header className="sticky top-0 z-[1000] border-b bg-background/90 backdrop-blur print:hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-card">Skip to content</a>
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Logo /> <span>Real<span className="text-primary">Garden</span></span>
        </Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          {nav.main.map((n) => (
            <Link key={n.label} href={n.href} aria-current={n.match(path) ? "page" : undefined}
              className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted aria-[current=page]:bg-secondary aria-[current=page]:font-medium">
              {n.label}
            </Link>
          ))}
          <More items={nav.more} />
        </nav>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="md:hidden border-t px-4 py-2 flex flex-col">
          {[...nav.main, ...nav.more].map((n) => (
            <Link key={n.label} href={n.href} onClick={() => setOpen(false)} className="py-2">{n.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t mt-16 bg-secondary/50 print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground space-y-2">
        <p>
          <strong className="text-foreground">Predictions are estimates.</strong> Confirm plant problems with your local{" "}
          <a className="underline" href="https://sfyl.ifas.ufl.edu/find-your-local-office/" target="_blank" rel="noreferrer">UF/IFAS Extension office</a>.
          {" "}Weather alerts from the National Weather Service. Follow official instructions in an emergency.
        </p>
        <p>Hackathon demo. Plant data is unverified until checked against UF/IFAS; plant data partly from Permapeople.org (CC BY-SA 4.0).
          Weather by Open-Meteo, map tiles © OpenStreetMap contributors.</p>
      </div>
    </footer>
  );
}

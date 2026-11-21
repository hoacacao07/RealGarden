"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/start", label: "Start" },
  { href: "/design", label: "Design" },
  { href: "/garden/maria", label: "Maria's garden" },
  { href: "/garden/linh", label: "Linh's balcony" },
  { href: "/plants", label: "Plants" },
  { href: "/map", label: "Disease map" },
];

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

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-[1000] border-b bg-background/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-card">Skip to content</a>
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Logo /> NativeScape <span className="text-primary">FL</span>
        </Link>
        <nav aria-label="Main" className="hidden sm:flex gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
              className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted aria-[current=page]:bg-secondary aria-[current=page]:font-medium">
              {n.label}
            </Link>
          ))}
        </nav>
        <button className="sm:hidden p-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="sm:hidden border-t px-4 py-2 flex flex-col">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t mt-16 bg-secondary/50">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground space-y-2">
        <p>
          <strong className="text-foreground">Predictions are estimates.</strong> Watering, frost, storm, bloom and disease
          predictions come from simple models and forecasts. Confirm plant choices and plant health problems with your local{" "}
          <a className="underline" href="https://sfyl.ifas.ufl.edu/find-your-local-office/" target="_blank" rel="noreferrer">
            UF/IFAS Extension office
          </a>.
        </p>
        <p>Hackathon demo. Plant data is unverified until checked against UF/IFAS and the Florida Native Plant Society.
          Weather by Open-Meteo, alerts by the National Weather Service, map tiles © OpenStreetMap contributors.</p>
      </div>
    </footer>
  );
}

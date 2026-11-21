import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Box, Building2, ShoppingBasket, Sun, Camera, CloudLightning, CloudRain, Flower2, Home, Map as MapIcon, Palette, Search, Snowflake, Sprout, Timer } from "lucide-react";

import { ResetButton } from "./reset-button";

export const metadata: Metadata = { title: "Presenter", robots: { index: false } };

/** Presenter controls. Not in the main nav. One click per step of DEMO_SCRIPT.md. */
const STEPS: { n: number; title: string; say: string; href: string; icon: React.ReactNode; cta: string }[] = [
  { n: 1, title: "Landing", say: "Florida yards waste water on plants that don't belong here. Maria wants a butterfly garden that mostly takes care of itself.", href: "/", icon: <Home />, cta: "Open landing" },
  { n: 2, title: "Purple next to yellow", say: "Color brush: Purple → Dense Blazing Star. Complementary partners show Leavenworth's Tickseed blooming together Aug–Oct.", href: "/design?garden=maria&tab=colors", icon: <Palette />, cta: "Open Colors tab" },
  { n: 3, title: "Native swap", say: "Mexican petunia is invasive here. The app swaps in wild petunia, same purple.", href: "/design?garden=maria&q=mexican+petunia", icon: <Search />, cta: "Search Mexican petunia" },
  { n: 4, title: "Colors through the year", say: "Drag the month slider, then the Timeline tab shows the peak and the weakest month.", href: "/design?garden=maria&tab=timeline", icon: <Flower2 />, cta: "Open Timeline tab" },
  { n: 5, title: "3D Plant Inspector", say: "Plan tab: double-click a firebush on the canvas, then press Play. It grows to year 3 next to a 6 ft stake.", href: "/design?garden=maria&tab=plan", icon: <Box />, cta: "Open Plan tab" },
  { n: 6, title: "Rainy week", say: "Rain is coming, so watering is skipped. Gallons saved vs a lawn.", href: "/garden/maria?scenario=rainy_week", icon: <CloudRain />, cta: "Replay rainy week" },
  { n: 7, title: "Cold snap", say: "Frost alert for the firebush with a plan: cover it before 9 PM.", href: "/garden/maria?scenario=cold_snap", icon: <Snowflake />, cta: "Replay cold snap" },
  { n: 8, title: "Photo check-in", say: "Spotted leaves: diagnosis with confidence, steps, and a note to confirm with UF/IFAS.", href: "/garden/maria/checkin?demo=spotted_firebush", icon: <Camera />, cta: "Run check-in" },
  { n: 9, title: "Disease map", say: "Our report joins the sample reports nearby. Three leaf-spot reports within 10 km trigger a warning.", href: "/map", icon: <MapIcon />, cta: "Open map" },
  { n: 10, title: "Coming up", say: "Close: what blooms and fruits next, and when.", href: "/garden/maria", icon: <Sprout />, cta: "Open dashboard" },
];

/** Balcony mode (Phase 11.5, spec demo step 5): Linh, 4th floor, west-facing balcony near USF. */
const LINH: { title: string; say: string; href: string; icon: React.ReactNode }[] = [
  { title: "Linh's balcony", say: "West-facing sun strip: 4 to 5 h of hot afternoon sun. Per-pot watering: the cherry tomatoes need water daily in summer. Weight estimate of the wet pots.", href: "/garden/linh", icon: <Building2 /> },
  { title: "Same hurricane, balcony version", say: "The alert now starts with Bring every pot, basket and trellis inside before the wind starts, plus the safety line.", href: "/garden/linh?scenario=hurricane", icon: <CloudLightning /> },
  { title: "Container picks", say: "Cherry tomato, basil and scarlet (tropical) sage in pots. Drag the month slider to see the 3 PM sun on the floor.", href: "/design?garden=linh&tab=plan", icon: <Sun /> },
  { title: "Balcony shopping list", say: "Pots by size, potting mix bags, saucers (no dripping on the neighbors), stakes.", href: "/garden/linh/plan?tab=shopping", icon: <ShoppingBasket /> },
];

const EXTRA = [
  { title: "Replay hurricane", href: "/garden/maria?scenario=hurricane", icon: <CloudLightning /> },
  { title: "Normal week", href: "/garden/maria?scenario=normal_week", icon: <Timer /> },
  { title: "Native-swap photo", href: "/garden/maria/checkin?demo=mexican_petunia", icon: <Camera /> },
  { title: "Healthy photo", href: "/garden/maria/checkin?demo=healthy_firebush", icon: <Camera /> },
];

export default function PresenterPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Presenter</p>
          <h1 className="text-3xl font-semibold">3-minute demo</h1>
          <p className="text-muted-foreground">Reset the demo gardens (Maria and Linh) first, then click through. Each step opens in this tab; use Back to return.</p>
        </div>
        <ResetButton />
      </header>

      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border bg-card p-4 flex gap-3">
            <span className="grid place-items-center size-9 shrink-0 rounded-full bg-primary text-primary-foreground font-semibold tabular-nums">{s.n}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-primary">{s.icon}{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.say}</p>
              <Link href={s.href} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground">
                {s.cta} <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-3" aria-labelledby="linh-h">
        <h2 id="linh-h" className="font-semibold">Step 5 alternative: switch to Linh&apos;s balcony</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LINH.map((s) => (
            <li key={s.href} className="rounded-2xl border bg-card p-4 space-y-2">
              <p className="font-semibold flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-primary">{s.icon}{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.say}</p>
              <Link href={s.href} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground">
                Open <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="extra-h">
        <h2 id="extra-h" className="font-semibold">Extras</h2>
        <div className="flex flex-wrap gap-2">
          {EXTRA.map((e) => (
            <Link key={e.href} href={e.href} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary [&_svg]:size-4 [&_svg]:text-primary">
              {e.icon}{e.title}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Full talk track with exact clicks: <code>DEMO_SCRIPT.md</code> in the repo.</p>
      </section>
    </div>
  );
}

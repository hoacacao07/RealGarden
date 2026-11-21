import Link from "next/link";
import { ArrowRight, Droplets, Leaf, Sprout } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getGarden, getPlants } from "@/lib/data";
import { gallons } from "@/lib/format";
import { buildDashboard } from "@/lib/predict";

export const dynamic = "force-dynamic";

/** Headline numbers from Maria's seeded garden, using the "typical spring week" scenario so they are stable. */
async function mariaStats() {
  try {
    const [garden, plants] = await Promise.all([getGarden("maria"), getPlants()]);
    if (!garden) return null;
    const d = await buildDashboard(garden, plants, "normal_week");
    return d.impact;
  } catch (e) {
    console.warn("[landing] Maria stats unavailable", e);
    return null;
  }
}

const LOOP = [
  { title: "Pick a style", text: "Butterflies, a salad bed, herbs, fruit, roses, or a balcony of pots. Mix as many as you like.", art: "design" },
  { title: "See it bloom", text: "Plants picked for your ZIP code, sun and soil. Watch the colors change month by month and grow over the years.", art: "preview" },
  { title: "Know what to buy", text: "A shopping list with how many plants, bags of soil and mulch. No guessing at the garden center.", art: "predict" },
  { title: "Simple care", text: "A short 'This week' list: water Tuesday, skip Thursday (rain), cover the basil tonight. Storm alerts come with a checklist.", art: "act" },
];

function LoopArt({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 120 80" className="w-full h-24" aria-hidden>
      <rect width="120" height="80" rx="14" fill="var(--sand)" />
      {kind === "design" && (<>
        <path d="M10 70h100" stroke="#d9d1b8" />
        {[20, 40, 60, 80, 100].map((x) => <path key={x} d={`M${x} 10v60`} stroke="#d9d1b8" strokeWidth=".6" />)}
        <circle cx="35" cy="35" r="16" fill="var(--leaf)" opacity=".5" /><circle cx="78" cy="48" r="10" fill="var(--coral)" opacity=".6" />
        <circle cx="95" cy="25" r="7" fill="var(--sky)" opacity=".7" />
      </>)}
      {kind === "preview" && (<>
        {["#4F7A3A", "#F4C21D", "#8E4FB0", "#E2512B", "#4F7A3A", "#F4C21D"].map((c, i) => <rect key={i} x={14 + i * 16} y={56 - [10, 22, 30, 26, 16, 8][i]} width="12" height={[10, 22, 30, 26, 16, 8][i]} rx="3" fill={c} opacity=".75" />)}
        <path d="M14 62h92" stroke="#d9d1b8" strokeWidth="2" />
        <circle cx="96" cy="22" r="9" fill="none" stroke="var(--leaf)" strokeWidth="2" /><path d="M87 22h18M96 13v18" stroke="var(--leaf)" strokeWidth="1" opacity=".5" />
      </>)}
      {kind === "predict" && (<>
        <path d="M12 62 L32 50 L50 56 L68 34 L86 40 L108 22" fill="none" stroke="var(--leaf)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M12 44h96" stroke="var(--coral)" strokeDasharray="4 3" strokeWidth="2" />
        <circle cx="68" cy="34" r="4" fill="var(--coral)" />
      </>)}
      {kind === "act" && (<>
        {[24, 42, 60].map((y, i) => (<g key={y}>
          <rect x="22" y={y - 7} width="12" height="12" rx="3" fill="#fff" stroke="var(--leaf)" strokeWidth="2" />
          {i < 2 && <path d={`M25 ${y - 1}l3 3 5-6`} stroke="var(--leaf)" strokeWidth="2" fill="none" />}
          <rect x="42" y={y - 3} width={i === 2 ? 40 : 56} height="5" rx="2.5" fill="var(--leaf)" opacity=".35" />
        </g>))}
      </>)}
    </svg>
  );
}

export default async function Home() {
  const stats = await mariaStats();
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--accent),transparent_60%),radial-gradient(ellipse_at_bottom_left,var(--sand),transparent_55%)]" />
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-12 grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <div className="space-y-6">
            <p className="inline-block rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">For Florida yards and balconies</p>
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
              A beautiful garden of your own, <span className="text-primary">planned</span>, <span className="text-[oklch(0.5_0.12_230)]">watched</span> and <span className="text-[oklch(0.52_0.16_32)]">looked after</span>.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Flowers, vegetables, herbs, fruit or a butterfly garden: pick a style and your ZIP code, and we do the rest.
              You get the plants that thrive where you live, what to buy, and simple reminders when the weather turns.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-5 text-base" asChild><Link href="/start">Start my garden <ArrowRight aria-hidden /></Link></Button>
              <Button size="lg" variant="outline" className="h-11 px-5 text-base" asChild><Link href="/garden/maria">See Maria&apos;s garden</Link></Button>
              <Button size="lg" variant="ghost" className="h-11 px-5 text-base" asChild><Link href="/garden/linh">Linh&apos;s balcony</Link></Button>
            </div>
          </div>
          <svg viewBox="0 0 400 320" className="w-full max-w-md mx-auto" role="img" aria-label="Illustration of a native garden with a palm, flowers and a butterfly">
            <ellipse cx="200" cy="290" rx="190" ry="26" fill="var(--sand)" />
            <path d="M120 290V140" stroke="#7a5f3a" strokeWidth="9" strokeLinecap="round" />
            <g fill="var(--leaf)">
              <path d="M120 140c-30-30-70-36-100-24 36-2 70 10 100 24z" /><path d="M120 140c30-30 70-36 100-24-36-2-70 10-100 24z" />
              <path d="M120 140c-8-40 0-70 22-92-6 32-14 60-22 92z" /><path d="M120 140c-36-6-66 10-80 36 22-18 50-30 80-36z" />
              <path d="M120 140c36-6 66 10 80 36-22-18-50-30-80-36z" />
            </g>
            <ellipse cx="270" cy="262" rx="70" ry="38" fill="oklch(0.55 0.1 158)" />
            {[[235, 240], [262, 228], [292, 236], [315, 252], [250, 258]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="9" fill="var(--coral)" />)}
            <g transform="translate(300 120) rotate(-15)">
              <path d="M0 0c-26-24-44-6-30 14 8 10 22 6 30-14zM0 0c26-24 44-6 30 14-8 10-22 6-30-14z" fill="#eda100" />
              <path d="M0 0c-16 10-22 30-8 32 8 0 10-16 8-32zM0 0c16 10 22 30 8 32-8 0-10-16-8-32z" fill="#eb6834" />
              <path d="M0-8v26" stroke="#2c2c2c" strokeWidth="3" strokeLinecap="round" />
            </g>
            <path d="M40 210c10-8 20-8 30 0s20 8 30 0" stroke="var(--sky)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M330 60l-6 14M350 54l-6 14M370 62l-6 14" stroke="var(--sky)" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      </section>

      {stats && (
        <section className="mx-auto max-w-6xl px-4" aria-labelledby="maria-h">
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <p id="maria-h" className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Maria&apos;s butterfly garden</span> · first-time homeowner in Tampa, about 2 miles from the bay
            </p>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Stat icon={<Leaf aria-hidden />} value={`${stats.bloom_months.length} of 12`} label="months with something in bloom" />
              <Stat icon={<Droplets aria-hidden />} value={`${gallons(stats.gallons_saved_week)} gal`} label="water saved in a typical spring week vs. a lawn" />
              <Stat icon={<Sprout aria-hidden />} value={`${stats.pollinator_score}/100`} label={`pollinator score, blooming in ${stats.bloom_months.length} of 12 months`} />
            </dl>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="loop-h">
        <h2 id="loop-h" className="text-2xl font-semibold mb-6">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((s, i) => (
            <li key={s.title} className="rounded-2xl border bg-card p-4 space-y-3">
              <LoopArt kind={s.art} />
              <p className="font-semibold"><span className="text-muted-foreground mr-1">{i + 1}.</span>{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-secondary p-2 text-primary [&_svg]:size-5">{icon}</span>
      <div>
        <dt className="sr-only">{label}</dt>
        <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
        <dd className="text-sm text-muted-foreground">{label}</dd>
      </div>
    </div>
  );
}

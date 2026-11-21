import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getGarden, getPlants } from "@/lib/data";

import { CheckinForm } from "./checkin-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Photo check-in" };

export default async function CheckinPage({ params, searchParams }: PageProps<"/garden/[id]/checkin">) {
  const { id } = await params;
  const sp = await searchParams;
  const [garden, plants] = await Promise.all([getGarden(id), getPlants()]);
  if (!garden) notFound();
  const inGarden = new Set(garden.placements.map((p) => p.plant_id));
  const options = plants.filter((p) => inGarden.has(p.id)).map((p) => ({ id: p.id, name: p.common_name }));
  const demo = typeof sp.demo === "string" ? sp.demo : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link href={`/garden/${garden.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {garden.name}
      </Link>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Photo check-in</h1>
        <p className="text-muted-foreground">Snap a plant. We identify it with Pl@ntNet, check its health with Gemini, and tell you what to do next.</p>
      </header>
      <CheckinForm gardenId={garden.id} plants={options} autoDemo={demo} />
    </div>
  );
}

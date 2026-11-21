import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { GardenChat } from "@/components/assistant/chat";
import { getGarden } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask Garden AI" };

/** Garden Assistant full page (spec 7B). The same chat also opens from the floating button on every page. */
export default async function AssistantPage({ params }: PageProps<"/garden/[id]/assistant">) {
  const { id } = await params;
  const garden = await getGarden(id);
  if (!garden) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <Link href={`/garden/${garden.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {garden.name}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">Ask Garden AI</h1>
        <p className="text-muted-foreground">Answers use your garden, the plant catalog, your forecast and alerts. It suggests; you confirm.</p>
      </div>
      <div className="rounded-2xl border bg-card h-[70vh] min-h-[420px] overflow-hidden">
        <GardenChat gardenId={garden.id} />
      </div>
    </div>
  );
}

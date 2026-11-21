"use client";

import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUI } from "@/lib/store";
import type { Plant } from "@/lib/types";

export function InspectButton({ plant, plantedOn }: { plant: Plant; plantedOn?: string }) {
  const open = useUI((s) => s.openInspector);
  return (
    <Button variant="outline" onClick={() => open({ plant, plantedOn })}>
      <Box aria-hidden /> View in 3D
    </Button>
  );
}

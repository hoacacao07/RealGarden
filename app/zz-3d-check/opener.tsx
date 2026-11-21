"use client";
import { useEffect } from "react";
import { useUI } from "@/lib/store";
import type { Plant } from "@/lib/types";
export function Opener({ plant, month, planted }: { plant: Plant; month: number; planted: string }) {
  const open = useUI((s) => s.openInspector);
  useEffect(() => { open({ plant, plantedOn: planted, today: `2026-${String(month).padStart(2, "0")}-15` }); }, [open, plant, month, planted]);
  return null;
}

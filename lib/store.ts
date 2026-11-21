"use client";

/** UI-only state (Zustand). Saved data always goes through the API to Postgres. */
import { create } from "zustand";

import type { Plant } from "./types";

export interface InspectTarget {
  plant: Plant;
  plantedOn?: string; // ISO date; age slider starts from here
  today?: string;
}

interface UIState {
  inspect: InspectTarget | null;
  openInspector: (t: InspectTarget) => void;
  closeInspector: () => void;
}

export const useUI = create<UIState>((set) => ({
  inspect: null,
  openInspector: (t) => set({ inspect: t }),
  closeInspector: () => set({ inspect: null }),
}));

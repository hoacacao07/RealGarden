"use client";

/** Design studio editing session (UI state). Persisted only when the user presses Save. */
import { create } from "zustand";

import { pointInPolygon } from "./engine/geo";
import type { PlacementInput, SiteInput, Theme, ZoneInput } from "./types";

export type Tool = "move" | "fill";
export interface Draft extends PlacementInput { key: string }

let n = 0;
export const newKey = () => `k${Date.now().toString(36)}${(n++).toString(36)}`;

interface DesignState {
  gardenId: string | null;
  name: string;
  theme: Theme | null;
  site: SiteInput | null;
  width: number;
  height: number;
  zones: ZoneInput[];
  placements: Draft[];
  selected: string | null;
  year: number;
  month: number;
  tool: Tool;
  dirty: boolean;
  snapshot: Draft[] | null; // version A for side-by-side compare
  history: Draft[][];
  initKey: string | null; // which garden (or "new") the session was loaded from

  init: (s: Partial<Pick<DesignState, "initKey" | "gardenId" | "name" | "theme" | "site" | "width" | "height" | "zones" | "placements" | "month">>) => void;
  set: (s: Partial<DesignState>) => void;
  add: (items: Omit<PlacementInput, "planted_on" | "zone_id">[]) => void;
  move: (key: string, x: number, y: number) => void;
  remove: (key: string) => void;
  /** Change one placement's fields (pot size, mount). */
  patch: (key: string, p: Partial<Pick<PlacementInput, "container_gal" | "mount" | "y_ft">>) => void;
  replaceAll: (items: Omit<PlacementInput, "planted_on" | "zone_id">[]) => void;
  undo: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function zoneFor(zones: ZoneInput[], x: number, y: number) {
  return zones.find((z) => pointInPolygon(x, y, z.polygon))?.id ?? zones[0]?.id ?? null;
}

export const useDesign = create<DesignState>((set, get) => ({
  gardenId: null, name: "My native garden", theme: "wildlife", site: null, width: 32, height: 20, zones: [], placements: [],
  selected: null, year: 0, month: new Date().getMonth() + 1, tool: "move", dirty: false, snapshot: null, history: [], initKey: null,

  init: (s) => set({ ...s, selected: null, dirty: false, history: [], snapshot: null, year: 0 }),
  set: (s) => set(s),
  add: (items) => {
    const { zones, placements } = get();
    const added = items.map((i) => ({ ...i, key: newKey(), planted_on: today(), zone_id: zoneFor(zones, i.x_ft, i.y_ft) }));
    set({ history: [...get().history, placements], placements: [...placements, ...added], dirty: true, selected: added.at(-1)?.key ?? null });
  },
  move: (key, x, y) => {
    const { zones, placements } = get();
    set({
      history: [...get().history, placements],
      placements: placements.map((p) => (p.key === key ? { ...p, x_ft: x, y_ft: y, zone_id: zoneFor(zones, x, y) } : p)),
      dirty: true,
    });
  },
  remove: (key) => {
    const { placements } = get();
    set({ history: [...get().history, placements], placements: placements.filter((p) => p.key !== key), selected: null, dirty: true });
  },
  patch: (key, p) => {
    const { placements } = get();
    set({ history: [...get().history, placements], placements: placements.map((d) => (d.key === key ? { ...d, ...p } : d)), dirty: true });
  },
  replaceAll: (items) => {
    const { zones, placements } = get();
    set({
      history: [...get().history, placements],
      placements: items.map((i) => ({ ...i, key: newKey(), planted_on: today(), zone_id: zoneFor(zones, i.x_ft, i.y_ft) })),
      selected: null, dirty: true,
    });
  },
  undo: () => {
    const h = get().history;
    if (!h.length) return;
    set({ placements: h[h.length - 1], history: h.slice(0, -1), dirty: true, selected: null });
  },
}));

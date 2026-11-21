"use client";

/** Grid canvas, 1 cell = 1 ft. Plants are circles sized by canopy at the chosen year. Loaded with next/dynamic (no SSR). */
import { useEffect, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";

import { clamp, round1 } from "@/lib/layout";
import type { ZoneInput } from "@/lib/types";

export const CATEGORY_COLOR: Record<string, string> = {
  palm: "#5f8f3e", large_tree: "#2f6b4f", small_tree: "#3f7f5f", shrub: "#4f9a6a", wildflower: "#e9785a",
  grass: "#b9a35a", vine: "#c0567a", fern: "#3f8f7f", aquatic: "#4a90c2", vegetable: "#d9572f", herb: "#6aa84f",
};
const ZONE_COLORS = ["#4a90c2", "#c9a54a", "#8a6fc2", "#4fae8a"];
const EDIBLE_COLOR = "#c8642f";

export interface CanvasItem {
  key: string;
  name: string;
  x_ft: number;
  y_ft: number;
  radius_ft: number;
  color: string;
  ring?: string; // outline color
  warn?: boolean; // overcrowded or shaded
  faded?: boolean;
}

export interface FillRect { x: number; y: number; w: number; h: number }

interface Props {
  widthFt: number;
  heightFt: number;
  items: CanvasItem[];
  zones?: ZoneInput[];
  selected?: string | null;
  tool?: "move" | "fill";
  readOnly?: boolean;
  showLabels?: boolean;
  label?: string;
  onSelect?: (key: string | null) => void;
  onOpen?: (key: string) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onDropPlant?: (plantId: string, x: number, y: number) => void;
  onFillRect?: (r: FillRect | null, done: boolean) => void;
  fillPreview?: { x_ft: number; y_ft: number; r: number }[];
}

export default function GardenCanvas({
  widthFt, heightFt, items, zones = [], selected = null, tool = "move", readOnly = false, showLabels = true,
  label = "Garden layout canvas", onSelect, onOpen, onMove, onDropPlant, onFillRect, fillPreview = [],
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(640);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<FillRect | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    setPx(Math.max(200, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setPx(Math.max(200, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const s = px / widthFt; // pixels per foot
  const h = heightFt * s;
  const toFt = (x: number, y: number) => [round1(clamp(x / s, 0, widthFt)), round1(clamp(y / s, 0, heightFt))] as const;

  return (
    <div ref={wrap} className="w-full rounded-xl overflow-hidden border bg-[#f3efe2] touch-none select-none" aria-label={label}
      onDragOver={(e) => { if (onDropPlant) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/plant-id");
        if (!id || !onDropPlant || !wrap.current) return;
        e.preventDefault();
        const b = wrap.current.getBoundingClientRect();
        const [x, y] = toFt(e.clientX - b.left, e.clientY - b.top);
        onDropPlant(id, x, y);
      }}>
      <Stage width={px} height={h}
        onMouseDown={(e) => {
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          if (tool === "fill" && onFillRect && !readOnly) {
            drag.current = { x: pos.x, y: pos.y };
            setRect(null);
          } else if (e.target === e.target.getStage() || e.target.name() === "bg") onSelect?.(null);
        }}
        onMouseMove={(e) => {
          if (!drag.current) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          const [x0, y0] = toFt(Math.min(drag.current.x, pos.x), Math.min(drag.current.y, pos.y));
          const [x1, y1] = toFt(Math.max(drag.current.x, pos.x), Math.max(drag.current.y, pos.y));
          const r = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
          setRect(r);
          onFillRect?.(r, false);
        }}
        onMouseUp={() => {
          if (!drag.current) return;
          drag.current = null;
          onFillRect?.(rect && rect.w >= 1 && rect.h >= 1 ? rect : null, true);
          setRect(null);
        }}>
        <Layer>
          <Rect name="bg" x={0} y={0} width={px} height={h} fill="#f3efe2" />
          {Array.from({ length: widthFt + 1 }, (_, i) => (
            <Line key={`v${i}`} points={[i * s, 0, i * s, h]} stroke="#ddd5bc" strokeWidth={i % 5 === 0 ? 1 : 0.4} listening={false} />
          ))}
          {Array.from({ length: heightFt + 1 }, (_, i) => (
            <Line key={`h${i}`} points={[0, i * s, px, i * s]} stroke="#ddd5bc" strokeWidth={i % 5 === 0 ? 1 : 0.4} listening={false} />
          ))}
          {zones.map((z, i) => {
            // Edible zones (Phase 11) are drawn as a solid-edged bed in terracotta; landscape zones stay dashed.
            const edible = z.kind === "edible";
            const col = edible ? EDIBLE_COLOR : ZONE_COLORS[i % ZONE_COLORS.length];
            const bed = edible ? (z.bed === "raised" ? "raised bed" : z.bed === "container" ? "pots" : "in-ground") : z.irrigation;
            return (
              <Group key={z.id ?? i} listening={false}>
                <Line points={z.polygon.flatMap(([x, y]) => [x * s, y * s])} closed
                  fill={col + (edible ? "26" : "14")} stroke={col} strokeWidth={edible ? 3 : 1.5} dash={edible ? undefined : [6, 4]} />
                {showLabels && (
                  <Text x={z.polygon[0][0] * s + 6} y={z.polygon[0][1] * s + 5} text={`${z.name} · ${bed}`}
                    fontSize={11} fill={col} fontStyle="bold" />
                )}
              </Group>
            );
          })}
          {[...items].sort((a, b) => b.radius_ft - a.radius_ft).map((t) => {
            const r = Math.max(t.radius_ft * s, 5);
            const isSel = selected === t.key;
            return (
              <Group key={t.key} x={t.x_ft * s} y={t.y_ft * s} draggable={!readOnly && tool === "move"}
                onClick={() => onSelect?.(t.key)} onTap={() => onSelect?.(t.key)}
                onDblClick={() => onOpen?.(t.key)} onDblTap={() => onOpen?.(t.key)}
                onDragStart={() => onSelect?.(t.key)}
                onDragEnd={(e) => {
                  const [x, y] = toFt(e.target.x(), e.target.y());
                  e.target.position({ x: x * s, y: y * s });
                  onMove?.(t.key, x, y);
                }}
                onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c && !readOnly) c.style.cursor = "grab"; }}
                onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ""; }}>
                <Circle radius={r} fill={t.color} opacity={t.faded ? 0.35 : 0.72}
                  stroke={t.warn ? "#e0553a" : t.ring ?? "#00000033"} strokeWidth={t.warn ? 3 : 1} dash={t.warn ? [5, 3] : undefined} />
                <Circle radius={Math.min(3, r / 2)} fill="#1f3b2f" opacity={0.55} />
                {isSel && <Circle radius={r + 4} stroke="#1f3b2f" strokeWidth={2} dash={[3, 3]} />}
                {showLabels && (r > 18 || isSel) && (
                  <Text text={t.name} fontSize={11} fill="#1f3b2f" y={Math.min(r, 16) + 3} width={120} offsetX={60} align="center" listening={false} />
                )}
              </Group>
            );
          })}
          {fillPreview.map((p, i) => (
            <Circle key={`fp${i}`} x={p.x_ft * s} y={p.y_ft * s} radius={Math.max(p.r * s, 4)} stroke="#2f6b4f" dash={[4, 3]} strokeWidth={1.5} listening={false} />
          ))}
          {rect && <Rect x={rect.x * s} y={rect.y * s} width={rect.w * s} height={rect.h * s} stroke="#2f6b4f" dash={[6, 4]} fill="#2f6b4f11" listening={false} />}
        </Layer>
      </Stage>
    </div>
  );
}

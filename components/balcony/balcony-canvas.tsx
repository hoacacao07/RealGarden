"use client";

/**
 * Balcony canvas (Phase 11.5), loaded with next/dynamic (no SSR). The balcony floor seen from above: railing along the
 * top edge, wall along the bottom, the overhang shaded, a compass arrow for the facing, and the floor area in direct
 * sun at 3 PM on the 15th of the chosen month. Pots are circles sized by container diameter; railing planters and
 * hanging baskets snap to the railing.
 */
import { useEffect, useRef, useState } from "react";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";

import { RAILING_D_FT } from "@/lib/engine/balconySun";
import { clamp, round1 } from "@/lib/layout";
import type { Mount } from "@/lib/types";

export interface PotItem {
  key: string;
  name: string;
  x_ft: number;
  y_ft: number;
  diameter_ft: number;
  color: string;
  mount: Mount;
  warn?: boolean;
}

interface Props {
  lengthFt: number;
  depthFt: number;
  facingDeg: number;
  overhangDepthFt: number;
  /** Floor depth (ft from the railing) in direct sun at 3 PM; 0 = none. */
  litDepthFt: number;
  litLabel: string;
  pots: PotItem[];
  selected?: string | null;
  readOnly?: boolean;
  label?: string;
  onSelect?: (key: string | null) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onOpen?: (key: string) => void;
  onDropPlant?: (plantId: string, x: number, y: number) => void;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const PAD = 28; // px around the floor for the railing label and compass

export default function BalconyCanvas({
  lengthFt, depthFt, facingDeg, overhangDepthFt, litDepthFt, litLabel, pots, selected = null, readOnly = false,
  label = "Balcony layout", onSelect, onMove, onOpen, onDropPlant,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(640);
  useEffect(() => {
    if (!wrap.current) return;
    setPx(Math.max(240, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setPx(Math.max(240, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const s = (px - 2 * PAD) / lengthFt; // px per ft
  const w = lengthFt * s;
  const h = depthFt * s;
  const H = h + 2 * PAD + 18;
  const toFt = (x: number, y: number) => [round1(clamp((x - PAD) / s, 0, lengthFt)), round1(clamp((y - PAD) / s, 0, depthFt))] as const;
  const ohTop = PAD + Math.max(0, depthFt - overhangDepthFt) * s;
  // Compass: "up" on screen is the facing direction; north is rotated accordingly.
  const northRot = -facingDeg;
  const facing = DIRS[Math.round((((facingDeg % 360) + 360) % 360) / 45) % 8];

  return (
    <div ref={wrap} className="w-full rounded-xl overflow-hidden border bg-[#eef1f3] touch-none select-none" aria-label={label}
      onDragOver={(e) => { if (onDropPlant) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/plant-id");
        if (!id || !onDropPlant || !wrap.current) return;
        e.preventDefault();
        const b = wrap.current.getBoundingClientRect();
        const [x, y] = toFt(e.clientX - b.left, e.clientY - b.top);
        onDropPlant(id, x, y);
      }}>
      <Stage width={px} height={H} onMouseDown={(e) => { if (e.target === e.target.getStage() || e.target.name() === "bg") onSelect?.(null); }}>
        <Layer>
          <Rect name="bg" x={0} y={0} width={px} height={H} fill="#eef1f3" />
          {/* floor */}
          <Rect name="bg" x={PAD} y={PAD} width={w} height={h} fill="#e6dccb" stroke="#b9ab92" />
          {Array.from({ length: Math.floor(lengthFt) + 1 }, (_, i) => (
            <Line key={`v${i}`} points={[PAD + i * s, PAD, PAD + i * s, PAD + h]} stroke="#d4c8b2" strokeWidth={0.5} listening={false} />
          ))}
          {/* direct sun at 3 PM */}
          {litDepthFt > 0 && <Rect x={PAD} y={PAD} width={w} height={Math.min(h, litDepthFt * s)} fill="#ffd34d" opacity={0.35} listening={false} />}
          {/* overhang */}
          {overhangDepthFt > 0 && (
            <Group listening={false}>
              <Rect x={PAD} y={ohTop} width={w} height={PAD + h - ohTop} fill="#5b6470" opacity={0.16} />
              <Line points={[PAD, ohTop, PAD + w, ohTop]} stroke="#5b6470" strokeWidth={1.5} dash={[8, 5]} />
              <Text x={PAD + 6} y={ohTop + 4} text="overhang above" fontSize={10} fill="#4a525c" />
            </Group>
          )}
          {/* railing (top) and wall (bottom) */}
          <Line points={[PAD, PAD, PAD + w, PAD]} stroke="#3d4a57" strokeWidth={4} listening={false} />
          {Array.from({ length: Math.floor(w / 10) }, (_, i) => (
            <Line key={`r${i}`} points={[PAD + i * 10 + 5, PAD - 6, PAD + i * 10 + 5, PAD]} stroke="#3d4a57" strokeWidth={1} listening={false} />
          ))}
          <Text x={PAD} y={6} text={`Railing · facing ${facing}`} fontSize={11} fontStyle="bold" fill="#3d4a57" listening={false} />
          <Rect x={PAD} y={PAD + h} width={w} height={8} fill="#8b8f96" listening={false} />
          <Text x={PAD} y={PAD + h + 10} text={`Wall / door · ${lengthFt} × ${depthFt} ft · sun at 3 PM: ${litLabel}`} fontSize={10} fill="#4a525c" listening={false} />
          {/* compass */}
          <Group x={px - PAD - 6} y={PAD + 20} listening={false}>
            <Circle radius={17} fill="#ffffffcc" stroke="#9aa3ad" />
            <Arrow points={[0, 10, 0, -12]} pointerLength={6} pointerWidth={6} fill="#c8642f" stroke="#c8642f" strokeWidth={2} />
            <Group rotation={northRot}>
              <Text text="N" x={-4} y={-30} fontSize={10} fontStyle="bold" fill="#1f3b2f" />
            </Group>
          </Group>
          {/* pots */}
          {pots.map((p) => {
            const r = Math.max(4, (p.diameter_ft / 2) * s);
            const isSel = selected === p.key;
            const snapped = p.mount !== "floor";
            return (
              <Group key={p.key} x={PAD + p.x_ft * s} y={PAD + (snapped ? RAILING_D_FT : p.y_ft) * s} draggable={!readOnly}
                onClick={() => onSelect?.(p.key)} onTap={() => onSelect?.(p.key)} onDblClick={() => onOpen?.(p.key)} onDblTap={() => onOpen?.(p.key)}
                onDragStart={() => onSelect?.(p.key)}
                onDragEnd={(e) => {
                  const [x, y] = toFt(e.target.x(), e.target.y());
                  const yy = snapped ? RAILING_D_FT : y;
                  e.target.position({ x: PAD + x * s, y: PAD + yy * s });
                  onMove?.(p.key, x, yy);
                }}>
                {p.mount === "railing"
                  ? <Rect x={-r} y={-r * 0.6} width={2 * r} height={1.2 * r} cornerRadius={3} fill="#a86b45" stroke="#6e4329" />
                  : <Circle radius={r} fill={p.mount === "hanging" ? "#ffffff00" : "#a86b45"} stroke="#6e4329" strokeWidth={p.mount === "hanging" ? 2 : 1} dash={p.mount === "hanging" ? [3, 2] : undefined} />}
                <Circle radius={r * 0.72} fill={p.color} opacity={0.85} stroke={p.warn ? "#e0553a" : undefined} strokeWidth={p.warn ? 2 : 0} />
                {isSel && <Circle radius={r + 4} stroke="#1f3b2f" strokeWidth={2} dash={[3, 3]} />}
                <Text text={p.name} fontSize={10} fill="#1f3b2f" y={r + 2} width={90} offsetX={45} align="center" listening={false} />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}

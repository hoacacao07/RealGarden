/** 2D SVG fallback for the Plant Inspector (no WebGL needed). Original simple drawing per form. */
import type { Plant } from "@/lib/types";

import type { Stage } from "./stage";

export function PlantSvg({ plant, heightFt, spreadFt, stage }: { plant: Plant; heightFt: number; spreadFt: number; stage: Stage }) {
  const maxH = Math.max(plant.mature_height_ft[1], 3);
  const scale = 230 / maxH; // px per ft
  const h = Math.max(8, heightFt * scale);
  const w = Math.max(10, spreadFt * scale);
  const base = 270;
  const cx = 160;
  const leaf = plant.foliage_color;
  const accent = stage === "flowers" ? plant.flower_colors[0]?.hex : stage === "fruit" ? plant.fruit_colors[0]?.hex : stage === "buds" ? "#9bb06b" : null;
  const dots = accent ? Array.from({ length: 14 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = Math.sqrt((i + 0.5) / 14);
    return [cx + Math.cos(a) * r * w * 0.45, base - h * 0.55 + Math.sin(a) * r * h * 0.4];
  }) : [];
  const dotR = stage === "buds" ? 2.5 : stage === "fruit" ? 3.5 : 5;

  let body: React.ReactNode;
  switch (plant.form) {
    case "palm":
      body = (
        <g>
          <rect x={cx - 4} y={base - h} width={8} height={h} rx={3} fill="#8a6a45" />
          {[-60, -25, 0, 25, 60, -100, 100].map((deg) => (
            <path key={deg} d={`M${cx} ${base - h} q ${Math.sin((deg * Math.PI) / 180) * w * 0.35} ${-20} ${Math.sin((deg * Math.PI) / 180) * w * 0.55} ${Math.abs(deg) / 4}`}
              stroke={leaf} strokeWidth={8} fill="none" strokeLinecap="round" />
          ))}
        </g>
      );
      break;
    case "tree":
      body = (
        <g>
          <rect x={cx - 5} y={base - h * 0.45} width={10} height={h * 0.45} rx={3} fill="#7a5a3a" />
          <ellipse cx={cx} cy={base - h * 0.65} rx={w / 2} ry={h * 0.38} fill={leaf} />
        </g>
      );
      break;
    case "grass":
      body = (
        <g stroke={leaf} strokeWidth={2.5} fill="none" strokeLinecap="round">
          {Array.from({ length: 13 }, (_, i) => {
            const t = (i - 6) / 6;
            return <path key={i} d={`M${cx + t * 6} ${base} Q ${cx + t * w * 0.3} ${base - h * 0.6} ${cx + t * w * 0.5} ${base - h}`} />;
          })}
        </g>
      );
      break;
    case "upright":
      body = (
        <g stroke={leaf} strokeWidth={3} fill="none" strokeLinecap="round">
          {Array.from({ length: 7 }, (_, i) => {
            const t = (i - 3) / 3;
            return <path key={i} d={`M${cx + t * 4} ${base} L ${cx + t * w * 0.4} ${base - h * (0.75 + 0.25 * (1 - Math.abs(t)))}`} />;
          })}
        </g>
      );
      break;
    case "vine":
      body = (
        <g>
          <rect x={cx - 1.5} y={base - h} width={3} height={h} fill="#b9a27a" />
          <path d={`M${cx} ${base} ${Array.from({ length: 8 }, (_, i) => `Q ${cx + (i % 2 ? 1 : -1) * w * 0.35} ${base - (h * (i + 0.5)) / 8} ${cx} ${base - (h * (i + 1)) / 8}`).join(" ")}`}
            stroke={leaf} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
      break;
    case "fern":
      body = (
        <g stroke={leaf} strokeWidth={5} fill="none" strokeLinecap="round">
          {[-70, -40, -15, 15, 40, 70].map((deg) => (
            <path key={deg} d={`M${cx} ${base} q ${Math.sin((deg * Math.PI) / 180) * w * 0.3} ${-h * 0.8} ${Math.sin((deg * Math.PI) / 180) * w * 0.55} ${-h * 0.7}`} />
          ))}
        </g>
      );
      break;
    case "spreading":
      body = <ellipse cx={cx} cy={base - h / 2} rx={w / 2} ry={Math.max(h / 2, 6)} fill={leaf} />;
      break;
    default:
      body = <path d={`M${cx - w / 2} ${base} C ${cx - w / 2} ${base - h * 1.1}, ${cx + w / 2} ${base - h * 1.1}, ${cx + w / 2} ${base} Z`} fill={leaf} />;
  }

  return (
    <svg viewBox="0 0 320 290" className="w-full h-full" role="img" aria-label={`${plant.common_name}, about ${heightFt.toFixed(1)} ft tall`}>
      <rect width="320" height="290" fill="var(--accent)" opacity=".5" />
      <ellipse cx={cx} cy={base + 4} rx={150} ry={12} fill="var(--sand)" />
      {body}
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={dotR} fill={accent!} stroke="#0002" />)}
      <g fontSize="11" fill="currentColor" opacity=".65">
        <line x1="20" x2="20" y1={base} y2={base - h} stroke="currentColor" />
        <text x="26" y={base - h + 4}>{heightFt.toFixed(1)} ft</text>
      </g>
    </svg>
  );
}

"use client";

/** Shareable image of the report card: drawn on a canvas in the browser and saved as a PNG. */
import { useEffect, useRef } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

const GRADE: Record<string, string> = { A: "#2e8b57", B: "#5f9e3a", C: "#c9a227", D: "#d9822b", F: "#c8453a" };

export function ShareCard({ name, grade, score, lines }: { name: string; grade: string; score: number; lines: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = 1080, H = 1080;
    c.width = W;
    c.height = H;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#eef6e8");
    g.addColorStop(1, "#d6ead2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = GRADE[grade] ?? "#2e8b57";
    ctx.beginPath();
    ctx.arc(W / 2, 330, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 220px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(grade, W / 2, 340);
    ctx.fillStyle = "#1f3b2a";
    ctx.font = "600 56px system-ui, sans-serif";
    ctx.fillText(name.slice(0, 32), W / 2, 590);
    ctx.font = "40px system-ui, sans-serif";
    ctx.fillStyle = "#3d5a46";
    ctx.fillText(`Eco score ${score} / 100`, W / 2, 660);
    ctx.font = "36px system-ui, sans-serif";
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(`🌱 ${l}`, W / 2, 760 + i * 64));
    ctx.font = "26px system-ui, sans-serif";
    ctx.fillStyle = "#5b7563";
    ctx.fillText("NativeScape FL · estimates", W / 2, H - 50);
  }, [name, grade, score, lines]);

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-3" aria-labelledby="share-h">
      <h2 id="share-h" className="text-lg font-semibold">Share your card</h2>
      <canvas ref={ref} className="w-full max-w-xs rounded-xl border aspect-square" aria-label={`Eco report card: grade ${grade}`} role="img" />
      <Button variant="outline" onClick={() => {
        const a = document.createElement("a");
        a.href = ref.current!.toDataURL("image/png");
        a.download = "eco-report-card.png";
        a.click();
      }}><Download aria-hidden /> Download image</Button>
    </section>
  );
}

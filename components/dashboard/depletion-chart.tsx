"use client";

import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ZoneOut } from "@/lib/predict";
import { shortDate } from "@/lib/format";

/** Soil water depletion (mm) per day vs. the readily-available-water stress threshold. One series, so no legend:
 * the card title names it and the reference line is labeled directly. */
export default function DepletionChart({ zone }: { zone: ZoneOut }) {
  const days = zone.days.slice(-21);
  const data = days.map((d) => ({ date: d.date, label: shortDate(d.date), depletion: Math.round(d.depletion_mm * 10) / 10, rain: Math.round(d.rain_mm * 10) / 10, rec: d.recommendation, fc: d.is_forecast }));
  const firstFc = data.find((d) => d.fc)?.label;
  const lastFc = data[data.length - 1]?.label;
  return (
    <figure className="space-y-2">
      <div className="h-48" role="img" aria-label={`Soil water used in ${zone.name}, last 14 days and 7-day forecast, against a stress threshold of ${zone.raw_mm.toFixed(0)} mm`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            {firstFc && <ReferenceArea x1={firstFc} x2={lastFc} fill="var(--accent)" fillOpacity={0.5} label={{ value: "Forecast", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }} />}
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={3} />
            <YAxis domain={[0, Math.ceil(zone.taw_mm)]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit=" mm" width={56} />
            <ReferenceLine y={zone.raw_mm} stroke="var(--coral)" strokeDasharray="5 4" strokeWidth={2}
              label={{ value: `Stress threshold ${zone.raw_mm.toFixed(0)} mm`, position: "insideBottomLeft", fontSize: 11, fill: "var(--foreground)" }} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-sm space-y-0.5">
                    <p className="font-medium">{p.label}{p.fc ? " (forecast)" : ""}</p>
                    <p>Soil water used: <strong>{p.depletion} mm</strong></p>
                    <p>Rain: {p.rain} mm</p>
                    {p.rec !== "none" && <p>Plan: {p.rec}</p>}
                  </div>
                );
              }} />
            <Area type="monotone" dataKey="depletion" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.15}
              dot={false} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-muted-foreground">Higher = drier soil. Watering is due when the line crosses the threshold.</figcaption>
    </figure>
  );
}

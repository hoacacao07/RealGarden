import { CloudRain, Droplets, Minus, PauseCircle } from "lucide-react";

import { dayLabel, mmToIn } from "@/lib/format";
import type { ZoneOut } from "@/lib/predict";

export function WaterCalendar({ zone }: { zone: ZoneOut }) {
  const fc = zone.days.filter((d) => d.is_forecast);
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-7 gap-1.5" aria-label={`7-day watering plan for ${zone.name}`}>
        {fc.map((d) => {
          const paused = d.reason.startsWith("Paused");
          const style = d.recommendation === "water" ? "bg-primary text-primary-foreground border-primary"
            : d.recommendation === "skip" ? "bg-accent border-sky text-accent-foreground" : paused ? "bg-coral/10 border-coral/40" : "bg-card";
          return (
            <li key={d.date} className={`rounded-xl border p-1.5 sm:p-2 text-center space-y-1 ${style}`} title={d.reason || undefined}>
              <p className="text-[11px] sm:text-xs font-medium">{dayLabel(d.date)}</p>
              <div className="flex justify-center [&_svg]:size-4" aria-hidden>
                {d.recommendation === "water" ? <Droplets /> : d.recommendation === "skip" ? <CloudRain /> : paused ? <PauseCircle /> : <Minus className="opacity-40" />}
              </div>
              <p className="text-[10px] sm:text-[11px] leading-tight font-medium">
                {d.recommendation === "water" ? `Water ${mmToIn(d.irrigation_mm)} in` : d.recommendation === "skip" ? "Skip" : paused ? "Paused" : "No need"}
              </p>
              {d.rain_mm >= 1 && <p className="text-[10px] opacity-80">{mmToIn(d.rain_mm, 1)} in rain</p>}
              <span className="sr-only">{d.reason}</span>
            </li>
          );
        })}
      </ol>
      {[...new Set(fc.filter((d) => d.reason).map((d) => (d.reason.startsWith("Paused") ? d.reason : `${dayLabel(d.date)}: ${d.reason}`)))].map((r) => (
        <p key={r} className="text-xs text-muted-foreground">{r}.</p>
      ))}
    </div>
  );
}

/**
 * Dashboard pipeline. Runs on page load, on Refresh and on scenario replay (no background jobs):
 * weather (+ scenario) → water balance per zone → frost / storm / water / disease alerts with action steps
 * → impact tiles and "Coming up" bloom/fruit predictions.
 */
import { actionPlan } from "./ai/features";
import { getAlerts } from "./clients/nws";
import { getWeather, isScenario, loadScenario } from "./clients/openmeteo";
import { readData } from "./clients/base";
import { prisma } from "./db";
import { getReports } from "./data";
import { clusterReports, gardenDiseaseHits } from "./engine/disease";
import { daysBetween, harvestWindow, stageKc } from "./engine/edibles";
import { frostNights } from "./engine/frost";
import { polygonArea, pointInPolygon, yearsBetween } from "./engine/geo";
import { canopyAreaAt, heightAt, spreadAt } from "./engine/growth";
import { impact, type Impact } from "./engine/impact";
import { predict, type Normals, type Prediction } from "./engine/phenology";
import { rankStormPlants, STORM_CHECKLIST, stormAlerts } from "./engine/storm";
import { pausesWater } from "./engine/alertTasks";
import { balconyAlertTasks, SAFETY_LINE } from "./engine/balcony";
import { POT_TOP_FT, potDistance, sunHours } from "./engine/balconySun";
import { canopyM2, isHotWall, potForecast, potKc, potPlan, type PotDay } from "./engine/containerWater";
import { IRRIGATION_CAP_MM, MM_PER_INCH, mmToGal, planZone, type WaterDayResult } from "./engine/water";
import type { ActionStep, GardenDoc, Mount, Plant, WeatherDay } from "./types";

export type Severity = "low" | "medium" | "high";
export interface AlertOut {
  id: string;
  type: "frost" | "storm" | "water" | "disease";
  severity: Severity;
  title: string;
  body: string;
  why: string;
  steps: ActionStep[];
  source: "gemini" | "fixture" | "template";
  sample?: boolean;
  /** Shown above the steps on severe weather alerts. */
  safety?: string;
}
export interface ZoneOut {
  id: string;
  name: string;
  irrigation: string;
  area_sqft: number;
  taw_mm: number;
  raw_mm: number;
  kc: number;
  root_in: number;
  plants: number;
  saved_gal_week: number;
  days: (WaterDayResult & { gallons: number })[];
  why: string;
}
export interface ComingUp extends Omit<Prediction, "event"> { event: Prediction["event"] | "harvest"; plant_id: string; name: string; count: number; color: string | null }
export interface PlacedPlant { id: string; plant: Plant; x_ft: number; y_ft: number; radius_ft: number; height_ft: number; age_years: number; planted_on: string }
/** One balcony pot (Phase 11.5): typical interval, next 7 days and sun hours this month. */
export interface PotOut {
  id: string;
  plant_id: string;
  name: string;
  gal: number;
  mount: Mount;
  open: boolean; // outside the overhang: rain reaches it
  sun_hours: number;
  summary: string;
  days: PotDay[];
}
export interface Dashboard {
  today: string; // weather "today" (scenario date in replay)
  realToday: string;
  weatherSource: string;
  scenario: { name: string; title: string; description: string } | null;
  forecast: WeatherDay[];
  alerts: AlertOut[];
  zones: ZoneOut[];
  impact: Impact;
  comingUp: ComingUp[];
  stormPause: boolean;
  placed: PlacedPlant[];
  pots: PotOut[]; // balcony gardens only
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayName = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const list = (names: string[], max = 3) => {
  const u = [...new Set(names)];
  const head = u.slice(0, max);
  const s = head.length > 1 ? `${head.slice(0, -1).join(", ")} and ${head.at(-1)}` : head[0] ?? "your plants";
  return u.length > max ? `${s} (+${u.length - max} more)` : s;
};
const ordinal = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerName = (s: string) => s.toLowerCase();

const realTodayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export async function buildDashboard(g: GardenDoc, plants: Plant[], scenario: string | null): Promise<Dashboard> {
  const realToday = realTodayIso();
  const byId = new Map(plants.map((p) => [p.id, p]));
  const [wx, nws, reports, checkins, stored] = await Promise.all([
    getWeather(g.site.lat, g.site.lon, scenario),
    getAlerts(g.site.lat, g.site.lon, scenario),
    getReports(),
    prisma.checkin.findMany({ where: { garden_id: g.id }, orderBy: { created_at: "desc" }, take: 50 }),
    // Phase 12 stored alerts (live NWS, heavy rain, simulated). Not during a scenario replay.
    isScenario(scenario) ? Promise.resolve([] as { event: string }[]) : prisma.alert.findMany({ where: { garden_id: g.id, active: true }, select: { event: true } }).catch(() => []),
  ]);
  const storedEvents = new Set(stored.map((a) => a.event));

  // Plants as they are today (ages use the real calendar even during a scenario replay).
  const placed: PlacedPlant[] = g.placements.filter((p) => byId.has(p.plant_id)).map((p) => {
    const plant = byId.get(p.plant_id)!;
    const age = yearsBetween(p.planted_on, realToday);
    return { id: p.id, plant, x_ft: p.x_ft, y_ft: p.y_ft, radius_ft: spreadAt(plant, age) / 2, height_ft: heightAt(plant, age), age_years: age, planted_on: p.planted_on };
  });
  // Spec: "plants in their first 12 months" (Kc ×1.3) and "plants under 12 months" (frost margin 6°F).
  const young = (pp: PlacedPlant) => pp.age_years < 1;

  // ---- storm (decides whether watering pauses)
  // Stored alerts carry their own task list (Alerts page), so the matching NWS card is not repeated here.
  const storms = stormAlerts(nws.alerts.filter((a) => !storedEvents.has(a.event)));
  // Watering pauses while a rain, flood or tropical alert is active (spec 7.3).
  const stormPause = storms.length > 0 || stored.some((a) => pausesWater(a.event));

  // ---- water balance per zone
  const zoneOf = (pp: PlacedPlant) => {
    const raw = g.placements.find((x) => x.id === pp.id)?.zone_id;
    if (raw && g.zones.some((z) => z.id === raw)) return raw;
    return g.zones.find((z) => pointInPolygon(pp.x_ft, pp.y_ft, z.polygon))?.id ?? g.zones[0]?.id;
  };
  // Survey/lab AWC replaces the soil-type table, but only from a trusted source (not Urban land "unknown").
  const awc = g.site.soil_source && g.site.soil_source !== "unknown" ? g.site.awc ?? null : null;
  // Balcony gardens (Phase 11.5) water pot by pot with the container model instead of the root-zone balance.
  const balcony = g.site.kind === "balcony";
  const month = Number(realToday.slice(5, 7));
  const pots: PotOut[] = !balcony ? [] : g.placements.filter((p) => byId.has(p.plant_id)).map((pl) => {
    const plant = byId.get(pl.plant_id)!;
    const gal = pl.container_gal ?? plant.min_container_gal ?? 3;
    const mount = pl.mount ?? "floor";
    const d = potDistance(mount, pl.y_ft);
    const open = (g.site.overhang_depth_ft ?? 0) <= 0 || d < Math.max(0, (g.site.balcony_w_ft ?? 0) - (g.site.overhang_depth_ft ?? 0));
    const fc = wx.forecast.map((w) => ({ date: w.date, et0_mm: w.et0_mm, rain_mm: w.rain_mm }));
    return {
      id: pl.id, plant_id: plant.id, name: plant.common_name, gal, mount, open,
      sun_hours: sunHours(g.site.lat, g.site.lon, g.site, month, d, POT_TOP_FT[mount]),
      summary: potPlan(plant, gal, g.site.facing_deg).summary,
      days: potForecast(fc, gal, potKc(plant), canopyM2(plant), isHotWall(g.site.facing_deg), open),
    };
  });
  const zones: ZoneOut[] = balcony ? [] : g.zones.map((z) => {
    const mine = placed.filter((pp) => zoneOf(pp) === z.id);
    const area = polygonArea(z.polygon) || 1;
    const cap = IRRIGATION_CAP_MM[z.irrigation as keyof typeof IRRIGATION_CAP_MM] ?? 20;
    const plan = planZone(
      mine.map((pp) => ({
        // Edibles use the FAO-56 stage Kc for their age; the ×1.3 establishing factor is for perennials only.
        kc: pp.plant.edible ? stageKc(pp.plant.edible, daysBetween(pp.planted_on, realToday)).kc : pp.plant.kc,
        root_depth_in: pp.plant.root_depth_in, canopy_sqft: canopyAreaAt(pp.plant, pp.age_years), establishing: !pp.plant.edible && young(pp),
      })),
      g.site.soil, area, cap, wx.history, wx.forecast, stormPause, awc,
    );
    const nYoung = mine.filter(young).length;
    return {
      id: z.id, name: z.name, irrigation: z.irrigation, area_sqft: area, taw_mm: plan.params.taw_mm, raw_mm: plan.params.raw_mm,
      kc: plan.params.kc, root_in: (plan.params.zr_m * 1000) / 25.4, plants: mine.length, saved_gal_week: plan.saved_gal_week,
      days: plan.days.map((d) => ({ ...d, gallons: mmToGal(d.irrigation_mm, area) })),
      why: `${Math.round((plan.params.zr_m * 1000) / 25.4)} in of ${g.site.soil.replace("_", " ")}${awc != null ? ` (survey AWC ${awc} cm/cm)` : ""} holds ${plan.params.taw_mm.toFixed(0)} mm of water; ` +
        `plants start to stress after ${plan.params.raw_mm.toFixed(0)} mm is used. Kc ${plan.params.kc.toFixed(2)}` +
        (nYoung ? ` (${nYoung} young plant${nYoung > 1 ? "s" : ""} count ×1.3).` : "."),
    };
  });

  const alerts: AlertOut[] = [];

  // ---- storm alerts
  if (stormPause) {
    const ranked = rankStormPlants(placed.map((pp) => ({ id: pp.id, name: pp.plant.common_name, height_ft: pp.height_ft, wind_tolerance: pp.plant.wind_tolerance })));
    const names = [...new Set(ranked.map((r) => r.name))];
    for (const a of storms) {
      if (balcony) {
        // Fixed order, no AI rewrite: bringing everything inside always comes first (spec 6B.8).
        const bt = balconyAlertTasks(a.event);
        alerts.push({
          id: `storm:${a.event}`, type: "storm", severity: /warning/i.test(a.event) ? "high" : "medium",
          title: `${a.event}: bring the balcony inside`,
          body: `${a.headline}. On a ${g.site.floor_level ?? 1}${ordinal(g.site.floor_level ?? 1)}-floor balcony, pots, baskets and trellises can blow off and hurt someone. Watering is paused.`,
          why: "NWS alert for this location. In balcony mode wind, tropical and severe storm alerts always start with bringing everything inside.",
          steps: bt.tasks.map((t, i) => ({ when: i === 0 ? "Now, before the wind" : "Before the storm", text: t })),
          source: "template", sample: a.synthetic, safety: bt.safety ?? SAFETY_LINE,
        });
        continue;
      }
      const plan = await actionPlan(
        { type: "storm", vars: { plants: list(names, 3), first: names[0] ?? "young trees" }, details: { alert: a.event, headline: a.headline, most_exposed: ranked, checklist: STORM_CHECKLIST } },
        () => STORM_CHECKLIST.map((t) => ({ when: "Today", text: t })),
      );
      alerts.push({
        id: `storm:${a.event}`, type: "storm", severity: /warning/i.test(a.event) ? "high" : "medium",
        title: `${a.event}: get the garden ready`,
        body: `${a.headline}. Most exposed: ${ranked.slice(0, 3).map((r) => `${r.name} (${r.height_ft.toFixed(1)} ft)`).join(", ")}. Watering is paused.`,
        why: "NWS alert for this location. Plant risk = current height × wind factor (1 low, 0.5 medium, 0.2 high wind tolerance).",
        steps: plan.steps, source: plan.source, sample: a.synthetic, safety: SAFETY_LINE,
      });
    }
  }

  // ---- frost alerts (one per risky night)
  const frostPlants = placed.map((pp) => ({ id: pp.id, name: pp.plant.common_name, cold_hardy_f: pp.plant.cold_hardy_f, young: young(pp) }));
  for (const n of frostNights(wx.forecast, frostPlants)) {
    const names = n.affected.map((a) => a.name);
    const plan = await actionPlan(
      { type: "frost", vars: { plants: list(names.map(lowerName)), first: lowerName(names[0]), day: dayName(n.date) }, details: { night: n.date, forecast_low_f: n.tmin_f, plants: n.affected } },
      () => [
        { when: `${dayName(n.date)} by 9 PM`, text: `Cover ${list(names)} with frost cloth down to the ground.` },
        { when: "Next morning", text: "Remove covers once it is above 40°F." },
        { when: "Next 2 weeks", text: "Do not prune cold-damaged leaves yet." },
      ],
    );
    const uniq = [...new Set(names)];
    alerts.push({
      id: `frost:${n.date}`, type: "frost", severity: n.severity,
      title: `Cold night ${dayName(n.date)}: low near ${Math.round(n.tmin_f)}°F`,
      body: `${uniq.length} plant type${uniq.length > 1 ? "s" : ""} at risk: ${uniq.join(", ")}.`,
      why: `Forecast low ${n.tmin_f.toFixed(0)}°F vs. each plant's cold-hardiness (+3°F margin, +6°F for plants under 12 months old).`,
      steps: plan.steps, source: plan.source,
    });
  }

  // ---- balcony water alert: the first day any pot drops below half its available water
  const potDays = pots.flatMap((p) => p.days.filter((d) => d.water).map((d) => ({ p, d }))).sort((a, b) => a.d.date.localeCompare(b.d.date));
  if (balcony && potDays.length && !stormPause) {
    const first = potDays[0].d.date;
    const names = potDays.filter((x) => x.d.date === first).map((x) => lowerName(x.p.name));
    const byDay = new Map<string, string[]>();
    for (const x of potDays) byDay.set(x.d.date, [...(byDay.get(x.d.date) ?? []), lowerName(x.p.name)]);
    const steps: ActionStep[] = [...byDay.entries()].slice(0, 5).map(([date, n]) => ({ when: dayName(date), text: `Water the ${list(n, 3)} pot${n.length > 1 ? "s" : ""} until water runs out the bottom.` }));
    if (g.site.rules?.no_drip) steps.push({ when: "Every time", text: "Use saucers so water doesn't drip onto balconies below." });
    alerts.push({
      id: `water:${first}`, type: "water", severity: "low", title: `Water pots on ${dayName(first)}`,
      body: `Pots dry out much faster than beds. First up: ${list(names, 3)}. ${pots.some((p) => !p.open) ? "Pots under the overhang get no rain." : ""}`.trim(),
      why: "Container model: available water = pot volume × 25% for potting mix; daily use = Kc × ET0 × canopy area" +
        (isHotWall(g.site.facing_deg) ? " × 1.2 for a hot west or south wall" : "") + "; water below 50%.",
      steps, source: "template",
    });
  }

  // ---- water alert (first action of the week across zones)
  const actions = zones.flatMap((z) => z.days.filter((d) => d.is_forecast && d.recommendation !== "none").map((d) => ({ z, d })))
    .sort((a, b) => a.d.date.localeCompare(b.d.date));
  if (actions.length && !stormPause) {
    const { z, d } = actions[0];
    const text = d.recommendation === "water"
      ? `Water ${z.name} on ${dayName(d.date)}: about ${(d.irrigation_mm / MM_PER_INCH).toFixed(2)} in (${Math.round(d.gallons)} gal).`
      : `Skip watering ${z.name} on ${dayName(d.date)}. ${d.reason}.`;
    const skips = actions.filter((x) => x.d.recommendation === "skip").length;
    const saved = zones.reduce((s, x) => s + x.saved_gal_week, 0);
    const zonePlants = placed.filter((pp) => zoneOf(pp) === z.id).map((pp) => lowerName(pp.plant.common_name));
    const plan = await actionPlan(
      { type: "water", vars: { day: dayName(d.date), first_text: text, plants: list(zonePlants, 2) }, details: { plan: actions.map((x) => ({ zone: x.z.name, date: x.d.date, rec: x.d.recommendation, reason: x.d.reason })) } },
      () => actions.slice(0, 5).map((x) => ({ when: dayName(x.d.date), text: x.d.recommendation === "water" ? `Water ${x.z.name}.` : `Skip watering ${x.z.name}.` })),
    );
    alerts.push({
      id: `water:${d.date}`, type: "water", severity: "low",
      title: d.recommendation === "skip" ? `Skip watering ${dayName(d.date)}` : `Water on ${dayName(d.date)}`,
      body: `${text}${skips ? ` ${skips} rain skip${skips > 1 ? "s" : ""} this week.` : ""}${saved >= 1 ? ` About ${Math.round(saved)} gal saved vs. a lawn on a timer.` : ""}`,
      why: "7-day soil water balance (FAO-56) using forecast rain and evapotranspiration.",
      steps: plan.steps, source: plan.source,
    });
  }

  // ---- disease alerts from nearby clusters
  const hits = gardenDiseaseHits(clusterReports(reports, new Date()), g.site.lat, g.site.lon, placed.map((pp) => pp.plant));
  for (const h of hits) {
    const plan = await actionPlan(
      { type: "disease", vars: { plants: list(h.susceptible.map(lowerName)), issue: h.cluster.label.toLowerCase() }, details: { issue: h.cluster.label, reports: h.cluster.ids.length, distance_km: h.distance_km, plants: h.susceptible } },
      () => [{ when: "This week", text: `Inspect ${list(h.susceptible)} for ${h.cluster.label.toLowerCase()}.` }],
    );
    alerts.push({
      id: `disease:${h.cluster.issue_key}`, type: "disease", severity: h.cluster.ids.length >= 5 ? "medium" : "low",
      title: `${h.cluster.label} reported nearby`,
      body: `${h.cluster.ids.length} gardens reported ${h.cluster.label.toLowerCase()} about ${h.distance_km} km away in the last 3 weeks. ${sentence(list(h.susceptible))} can be affected.`,
      why: "Shared check-ins (locations rounded to ~1 km) grouped within 5 km over 21 days; 3+ reports within 10 km trigger an alert.",
      steps: plan.steps, source: plan.source, sample: h.cluster.sample,
    });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  // ---- coming up: bloom and fruit per species (real calendar; check-in photos override)
  const normals = readData<Normals>("scenarios/normals.json");
  const observed = isScenario(scenario) ? [] : [...wx.history, ...wx.forecast];
  const photoFor = new Map<string, { stage: string; date: string }>();
  for (const c of checkins) {
    const stage = (c.diagnosis as { phenology_stage?: string })?.phenology_stage;
    if (c.matched_plant_id && stage && !photoFor.has(c.matched_plant_id)) photoFor.set(c.matched_plant_id, { stage, date: c.created_at.toISOString().slice(0, 10) });
  }
  const species = new Map<string, PlacedPlant[]>();
  for (const pp of placed) species.set(pp.plant.id, [...(species.get(pp.plant.id) ?? []), pp]);
  const comingUp: ComingUp[] = [];
  for (const [id, group] of species) {
    const p = group[0].plant;
    if (p.edible) {
      // Harvest window from the newest planting's date + days to harvest (+ weeks of picking).
      const newest = group.reduce((a, b) => (a.planted_on > b.planted_on ? a : b));
      const hw = harvestWindow(p.edible, newest.planted_on);
      if (hw.end < realToday) continue;
      comingUp.push({
        event: "harvest", earliest: hw.start, latest: hw.end, now: hw.start <= realToday, confidence: "medium",
        basis: `${p.edible.days_to_harvest[0]} to ${p.edible.days_to_harvest[1]} days from planting on ${newest.planted_on}`,
        plant_id: id, name: p.common_name, count: group.length, color: p.fruit_colors[0]?.hex ?? p.foliage_color,
      });
      continue;
    }
    const youngest = group.reduce((a, b) => (a.planted_on > b.planted_on ? a : b));
    const photo = photoFor.get(id);
    for (const pr of predict({ plant: p, today: realToday, plantedOn: youngest.planted_on, observed, normals, photo: photo && ["budding", "flowering"].includes(photo.stage) ? photo : undefined })) {
      const color = pr.event === "bloom" ? p.flower_colors[0]?.hex ?? null : p.fruit_colors[0]?.hex ?? null;
      comingUp.push({ ...pr, plant_id: id, name: p.common_name, count: group.length, color });
    }
  }
  comingUp.sort((a, b) => Number(b.confidence === "high") - Number(a.confidence === "high") || Number(!!a.now) - Number(!!b.now) || a.earliest.localeCompare(b.earliest));

  const sc = isScenario(scenario) ? loadScenario(scenario) : null;
  return {
    today: wx.today, realToday, weatherSource: wx.source,
    scenario: sc ? { name: sc.name, title: sc.title, description: sc.description } : null,
    forecast: wx.forecast, alerts, zones, stormPause, placed, comingUp, pots,
    impact: impact(placed.map((pp) => pp.plant), zones.reduce((s, z) => s + z.saved_gal_week, 0)),
  };
}

/**
 * Community disease clusters. Reports with the same issue within 5 km of each other
 * (single linkage) over the last 21 days form a cluster. A cluster of ≥ 3 reports whose
 * centroid is within 10 km warns a garden that has a plant listing that issue.
 */
import type { Plant, ReportPoint } from "../types";
import { haversineKm } from "./geo";

export interface Cluster { issue_key: string; label: string; lat: number; lon: number; ids: string[]; sample: boolean }

export function clusterReports(reports: ReportPoint[], now: Date, radiusKm = 5, windowDays = 21): Cluster[] {
  const cutoff = now.getTime() - windowDays * 86400e3;
  const recent = reports.filter((r) => Date.parse(r.created_at) >= cutoff);
  const out: Cluster[] = [];
  for (const key of [...new Set(recent.map((r) => r.issue_key))].sort()) {
    const group = recent.filter((r) => r.issue_key === key);
    const seen = new Set<string>();
    for (const r of group) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const comp: ReportPoint[] = [];
      const stack = [r];
      while (stack.length) {
        const cur = stack.pop()!;
        comp.push(cur);
        for (const o of group) {
          if (!seen.has(o.id) && haversineKm(cur.lat, cur.lon, o.lat, o.lon) <= radiusKm) {
            seen.add(o.id);
            stack.push(o);
          }
        }
      }
      out.push({
        issue_key: key, label: comp[0].label,
        lat: comp.reduce((s, c) => s + c.lat, 0) / comp.length,
        lon: comp.reduce((s, c) => s + c.lon, 0) / comp.length,
        ids: comp.map((c) => c.id).sort(),
        sample: comp.every((c) => c.is_sample),
      });
    }
  }
  return out;
}

export interface DiseaseHit { cluster: Cluster; distance_km: number; susceptible: string[] }

export function gardenDiseaseHits(clusters: Cluster[], lat: number, lon: number, plants: Plant[], minReports = 3, alertKm = 10): DiseaseHit[] {
  const hits: DiseaseHit[] = [];
  for (const c of clusters) {
    if (c.ids.length < minReports) continue;
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d > alertKm) continue;
    const sus = [...new Set(plants.filter((p) => p.common_issues.includes(c.issue_key)).map((p) => p.common_name))].sort();
    if (sus.length) hits.push({ cluster: c, distance_km: Math.round(d * 10) / 10, susceptible: sus });
  }
  return hits;
}

"use client";

import "leaflet/dist/leaflet.css";

import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";

import type { ReportPoint } from "@/lib/types";

import { ISSUE_COLOR } from "./issue-colors";

const ago = (iso: string) => {
  const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400e3));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function LeafletMap({ reports, home, names }: { reports: ReportPoint[]; home: { lat: number; lon: number; name: string } | null; names: Record<string, string> }) {
  const center: [number, number] = home ? [home.lat, home.lon] : [27.95, -82.46];
  // Several reports can share a rounded point: fan them out slightly so each stays clickable.
  const seen = new Map<string, number>();
  return (
    <MapContainer center={center} zoom={12} className="h-[520px] w-full" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {home && (
        <>
          <Circle center={[home.lat, home.lon]} radius={10_000} pathOptions={{ color: "#2f6b4f", weight: 1, dashArray: "6 6", fillOpacity: 0.03 }} />
          <CircleMarker center={[home.lat, home.lon]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2f6b4f", fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -8]} permanent>{home.name}</Tooltip>
          </CircleMarker>
        </>
      )}
      {reports.map((r) => {
        const k = `${r.lat},${r.lon}`;
        const i = seen.get(k) ?? 0;
        seen.set(k, i + 1);
        const a = i * 2.4;
        const pos: [number, number] = [r.lat + (i ? Math.sin(a) * 0.0025 * Math.sqrt(i) : 0), r.lon + (i ? Math.cos(a) * 0.003 * Math.sqrt(i) : 0)];
        return (
          <CircleMarker key={r.id} center={pos} radius={r.is_sample ? 8 : 10}
            pathOptions={{ color: r.is_sample ? "#ffffff" : "#1d1d1d", weight: r.is_sample ? 1.5 : 3, dashArray: r.is_sample ? "3 2" : undefined, fillColor: ISSUE_COLOR(r.issue_key), fillOpacity: 0.85 }}>
            <Popup>
              <strong>{r.label}</strong><br />
              {r.host_plant_id ? `On ${names[r.host_plant_id] ?? r.host_plant_id}` : "Plant not given"} · {ago(r.created_at)}<br />
              <em>{r.is_sample ? "Sample data (not a real report)" : "Shared from a check-in"}</em>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

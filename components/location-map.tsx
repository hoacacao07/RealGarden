"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

const FL_CENTER: [number, number] = [28.1, -82.4];

function ClickToPin({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, Math.max(map.getZoom(), 11));
  }, [pos, map]);
  return null;
}

/** Leaflet map where the user drops a pin. Rendered client-only (see design wizard). */
export default function LocationMap({ value, onPick }: { value: [number, number] | null; onPick: (lat: number, lon: number) => void }) {
  return (
    <MapContainer center={value ?? FL_CENTER} zoom={value ? 11 : 6} className="h-72 w-full" scrollWheelZoom={false}
      maxBounds={L.latLngBounds([23.5, -88.5], [31.5, -79])}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickToPin onPick={onPick} />
      <Recenter pos={value} />
      {value && <CircleMarker center={value} radius={9} pathOptions={{ color: "#2f6b4f", fillColor: "#e9785a", fillOpacity: 0.9 }} />}
    </MapContainer>
  );
}

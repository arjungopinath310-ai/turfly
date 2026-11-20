"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { MapPoint } from "@/lib/search";
import { rupees } from "@/lib/engine/pricing";

const pin = (live: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${live ? "#039855" : "#64748b"};border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3)"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

export default function TurfMap({ rows, center, zoom = 13, height = 560 }: { rows: MapPoint[]; center: { lat: number; lng: number }; zoom?: number; height?: number }) {
  return (
    <div className="card overflow-hidden p-0" style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {rows.map((t) => (
          <Marker key={t.id} position={[t.lat, t.lng]} icon={pin(t.availabilityMode === "LIVE")}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-slate-500">{t.locality}{t.minPrice != null ? ` · from ${rupees(t.minPrice)}/hr` : ""}</div>
                <Link href={`/turfs/${t.slug}`} className="text-xs font-semibold text-brand-700">View & book →</Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

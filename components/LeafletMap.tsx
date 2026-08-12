"use client";

import { useEffect, useRef, useState } from "react";
import type { SiraIncident } from "@/types/incident";

type Point = { latitude: number; longitude: number };

type Props = {
  center: Point;
  zoom?: number;
  incidents?: SiraIncident[];
  selected?: Point | null;
  interactivePin?: boolean;
  onPinChange?: (point: Point) => void;
  compact?: boolean;
};

const PAKISTAN_BOUNDS: [[number, number], [number, number]] = [[23.3, 60.5], [37.3, 77.8]];

export default function LeafletMap({ center, zoom = 6, incidents = [], selected, interactivePin = false, onPinChange, compact = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const pinRef = useRef<any>(null);
  const onPinRef = useRef(onPinChange);
  const interactiveRef = useRef(interactivePin);
  const [ready, setReady] = useState(false);
  onPinRef.current = onPinChange;
  interactiveRef.current = interactivePin;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hostRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !hostRef.current) return;
      const map = L.map(hostRef.current, { scrollWheelZoom: true, minZoom: 5, maxBounds: PAKISTAN_BOUNDS, maxBoundsViscosity: .7 }).setView([center.latitude, center.longitude], zoom);
      const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
      const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" });
      street.addTo(map);
      L.control.layers({ Map: street, Satellite: satellite }, undefined, { position: "bottomright", collapsed: false }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: any) => {
        if (!interactiveRef.current) return;
        onPinRef.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      });
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => { cancelled = true; setReady(false); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([center.latitude, center.longitude], zoom, { animate: true });
  }, [center.latitude, center.longitude, zoom, ready]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) return;
      const L = await import("leaflet");
      if (cancelled) return;
      layer.clearLayers();
      incidents.forEach((incident) => {
        const sev = String(incident.severity || "medium");
        const color = sev === "critical" ? "#b91c1c" : sev === "high" ? "#ea580c" : sev === "low" ? "#15803d" : "#ca8a04";
        const icon = L.divIcon({ className: "", html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 3px 9px rgba(15,23,42,.35)"></div>`, iconSize: [22,22], iconAnchor: [11,20] });
        const marker = L.marker([incident.latitude, incident.longitude], { icon }).bindPopup(`<div style="min-width:180px"><b>${escapeHtml(incident.title)}</b><br/><span>${escapeHtml(String(incident.stage || "Threat"))} • ${escapeHtml(String(incident.sub_stage || "Reported"))}</span><br/><a href="/incident/${incident.id}" style="color:#1267e8;font-weight:800">Open incident</a></div>`);
        layer.addLayer(marker);
      });
    })();
    return () => { cancelled = true; };
  }, [incidents, ready]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const L = await import("leaflet");
      if (cancelled) return;
      if (!selected) {
        if (pinRef.current) map.removeLayer(pinRef.current);
        pinRef.current = null;
        return;
      }
      const icon = L.divIcon({ className: "", html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1267e8;border:4px solid white;box-shadow:0 4px 12px rgba(15,23,42,.42)"></div>`, iconSize:[27,27], iconAnchor:[13,25] });
      if (!pinRef.current) {
        pinRef.current = L.marker([selected.latitude, selected.longitude], { icon, draggable: interactivePin }).addTo(map);
        pinRef.current.on("dragend", (e: any) => { const p=e.target.getLatLng(); onPinRef.current?.({ latitude:p.lat, longitude:p.lng }); });
      } else {
        pinRef.current.setLatLng([selected.latitude, selected.longitude]);
        if (interactivePin) pinRef.current.dragging?.enable();
        else pinRef.current.dragging?.disable();
      }
    })();
    return () => { cancelled = true; };
  }, [selected?.latitude, selected?.longitude, interactivePin, ready]);

  return <div ref={hostRef} className={compact ? "map-canvas compact" : "map-canvas"} />;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch] || ch));
}

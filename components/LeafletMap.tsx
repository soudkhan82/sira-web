"use client";

import { useEffect, useRef, useState } from "react";
import type { SiraIncident } from "@/types/incident";
import {
  getPublicIncidentCode,
  getShortStatusLabel,
} from "@/types/incident";
import { inferSiraArea } from "@/lib/siraAreas";

type Point = { latitude: number; longitude: number };

type Props = {
  center: Point;
  zoom?: number;
  incidents?: SiraIncident[];
  selected?: Point | null;
  interactivePin?: boolean;
  onPinChange?: (point: Point) => void;
  compact?: boolean;
  selectedIncidentId?: string | null;
  onIncidentSelect?: (incidentId: string) => void;
};

const PAKISTAN_BOUNDS: [[number, number], [number, number]] = [
  [23.3, 60.5],
  [37.3, 77.8],
];

export default function LeafletMap({
  center,
  zoom = 6,
  incidents = [],
  selected,
  interactivePin = false,
  onPinChange,
  compact = false,
  selectedIncidentId = null,
  onIncidentSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const incidentMarkersRef = useRef<Map<string, any>>(new Map());
  const pinRef = useRef<any>(null);
  const onPinRef = useRef(onPinChange);
  const interactiveRef = useRef(interactivePin);
  const onIncidentSelectRef = useRef(onIncidentSelect);
  const [ready, setReady] = useState(false);

  onPinRef.current = onPinChange;
  interactiveRef.current = interactivePin;
  onIncidentSelectRef.current = onIncidentSelect;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hostRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !hostRef.current) return;

      const map = L.map(hostRef.current, {
        scrollWheelZoom: true,
        minZoom: 5,
        maxBounds: PAKISTAN_BOUNDS,
        maxBoundsViscosity: 0.7,
        zoomControl: true,
      }).setView([center.latitude, center.longitude], zoom);

      const street = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }
      );

      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }
      );

      street.addTo(map);
      L.control
        .layers(
          { Standard: street, Satellite: satellite },
          undefined,
          { position: "bottomright", collapsed: true }
        )
        .addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event: any) => {
        if (!interactiveRef.current) return;
        onPinRef.current?.({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      });

      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      setReady(false);
      incidentMarkersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedIncidentId) {
      map.setView([center.latitude, center.longitude], zoom, { animate: true });
    }
  }, [center.latitude, center.longitude, zoom, ready, selectedIncidentId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) return;

      const L = await import("leaflet");
      if (cancelled) return;

      layer.clearLayers();
      incidentMarkersRef.current.clear();

      incidents.forEach((incident) => {
        const selectedMarker = incident.id === selectedIncidentId;
        const severity = String(incident.severity || "medium");
        const color =
          severity === "critical"
            ? "#dc2626"
            : severity === "high"
              ? "#f97316"
              : severity === "low"
                ? "#16a34a"
                : "#eab308";

        const area = inferSiraArea(incident);
        const location = area
          ? `${area.subRegion} / ${area.name}`
          : incident.city || "Location not classified";

        const icon = L.divIcon({
          className: "sira-marker-wrapper",
          html: `
            <div class="sira-marker ${selectedMarker ? "is-selected" : ""}" style="--marker-color:${color}">
              <span></span>
            </div>
          `,
          iconSize: selectedMarker ? [38, 44] : [30, 36],
          iconAnchor: selectedMarker ? [19, 42] : [15, 34],
          popupAnchor: [0, -32],
        });

        const popup = `
          <div class="sira-popup">
            <div class="sira-popup-code">${escapeHtml(getPublicIncidentCode(incident))}</div>
            <strong>${escapeHtml(incident.title)}</strong>
            <div class="sira-popup-pills">
              <span>${escapeHtml(String(incident.severity || "medium").toUpperCase())}</span>
              <span>${escapeHtml(getShortStatusLabel(incident.status))}</span>
            </div>
            <p>${escapeHtml(String(incident.stage || "Threat"))} - ${escapeHtml(String(incident.sub_stage || "Reported"))}</p>
            <p>${escapeHtml(location)}</p>
            <a href="/incident/${encodeURIComponent(incident.id)}">Open incident details</a>
          </div>
        `;

        const marker = L.marker(
          [Number(incident.latitude), Number(incident.longitude)],
          { icon, riseOnHover: true }
        ).bindPopup(popup, { closeButton: false, offset: [0, -4] });

        marker.on("click", () => {
          onIncidentSelectRef.current?.(incident.id);
        });

        layer.addLayer(marker);
        incidentMarkersRef.current.set(incident.id, marker);
      });

      if (selectedIncidentId) {
        const selectedIncident = incidents.find(
          (incident) => incident.id === selectedIncidentId
        );
        const marker = incidentMarkersRef.current.get(selectedIncidentId);

        if (selectedIncident && marker) {
          map.flyTo(
            [Number(selectedIncident.latitude), Number(selectedIncident.longitude)],
            Math.max(map.getZoom(), 11),
            { animate: true, duration: 0.65 }
          );
          setTimeout(() => marker.openPopup(), 380);
        }
      } else if (incidents.length > 1) {
        const bounds = L.latLngBounds(
          incidents.map((incident) => [
            Number(incident.latitude),
            Number(incident.longitude),
          ])
        );
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.18), { maxZoom: 10, animate: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incidents, selectedIncidentId, ready]);

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

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1267e8;border:4px solid white;box-shadow:0 4px 12px rgba(15,23,42,.42)"></div>`,
        iconSize: [27, 27],
        iconAnchor: [13, 25],
      });

      if (!pinRef.current) {
        pinRef.current = L.marker(
          [selected.latitude, selected.longitude],
          { icon, draggable: interactivePin }
        ).addTo(map);

        pinRef.current.on("dragend", (event: any) => {
          const point = event.target.getLatLng();
          onPinRef.current?.({
            latitude: point.lat,
            longitude: point.lng,
          });
        });
      } else {
        pinRef.current.setLatLng([selected.latitude, selected.longitude]);

        if (interactivePin) pinRef.current.dragging?.enable();
        else pinRef.current.dragging?.disable();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.latitude, selected?.longitude, interactivePin, ready]);

  return (
    <div
      ref={hostRef}
      className={compact ? "map-canvas compact" : "map-canvas"}
    />
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        } as Record<string, string>
      )[character] || character
  );
}

"use client";

import { useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import MapShell from "@/components/map-shell";
import LayerToggle, { type LayerKey } from "@/components/layer-toggle";
import AggregateIndicators from "@/components/aggregate-indicators";
import AlertsPanel from "@/components/alerts-panel";
import ExportReportButton from "@/components/export-report-button";
import { ndviToColor, ndwiToColor } from "@/lib/colors";

type GeoJSONFeature = {
  properties: {
    nombre: string;
    ndvi: number;
    ndwi: number;
    colorNdvi?: string;
    colorNdwi?: string;
  };
};

type GeoJSONCollection = {
  features: GeoJSONFeature[];
};

export default function PanelPage() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layer, setLayer] = useState<LayerKey>("ndvi");

  async function handleReady(map: maplibregl.Map) {
    mapRef.current = map;
    const gj = (await fetch("/data/departamentos.geojson").then((r) => r.json())) as GeoJSONCollection;
    for (const f of gj.features) {
      f.properties.colorNdvi = ndviToColor(f.properties.ndvi);
      f.properties.colorNdwi = ndwiToColor(f.properties.ndwi);
    }
    // Cast through unknown: fetched GeoJSON is structurally valid but typed as our local shape
    map.addSource("departamentos", { type: "geojson", data: gj as unknown as maplibregl.GeoJSONSourceSpecification["data"] });
    map.addLayer({
      id: "dep-ndvi",
      type: "fill",
      source: "departamentos",
      paint: { "fill-color": ["get", "colorNdvi"], "fill-opacity": 0.55 },
    });
    map.addLayer({
      id: "dep-ndwi",
      type: "fill",
      source: "departamentos",
      layout: { visibility: "none" },
      paint: { "fill-color": ["get", "colorNdwi"], "fill-opacity": 0.55 },
    });
    map.addLayer({
      id: "dep-borders",
      type: "line",
      source: "departamentos",
      paint: { "line-color": "#ffffff", "line-width": 1 },
    });
  }

  function handleToggle(k: LayerKey) {
    setLayer(k);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty("dep-ndvi", "visibility", k === "ndvi" ? "visible" : "none");
    map.setLayoutProperty("dep-ndwi", "visibility", k === "ndwi" ? "visible" : "none");
  }

  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="bg-emerald-900 px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">Panel Territorial Agrícola · La Rioja</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <MapShell center={[-67.2, -29.4]} zoom={6.3} onReady={handleReady} />
          <div className="absolute left-2 top-2 z-10">
            <LayerToggle active={layer} onChange={handleToggle} />
          </div>
        </div>
        <aside className="w-80 space-y-4 overflow-y-auto bg-white p-3">
          <AggregateIndicators />
          <AlertsPanel />
          <ExportReportButton />
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import MapShell from "@/components/map-shell";
import LayerToggle, { type LayerKey } from "@/components/layer-toggle";
import AggregateIndicators from "@/components/aggregate-indicators";
import AlertsPanel from "@/components/alerts-panel";
import ExportReportButton from "@/components/export-report-button";
import ProducerView from "@/components/producer-view";
import MapLegend from "@/components/map-legend";
import DepartmentDetail from "@/components/department-detail";
import { ndviToColor, ndwiToColor } from "@/lib/colors";
import { fetchDepartamentos, type DepartamentoProps } from "@/lib/departamentos";
import { fetchJson, SeriesSchema } from "@/lib/data";

type GeoJSONFeature = {
  properties: {
    nombre: string;
    ndvi: number;
    ndwi: number;
    fuente: "satelital" | "referencia";
    colorNdvi?: string;
    colorNdwi?: string;
  };
};

type GeoJSONCollection = {
  features: GeoJSONFeature[];
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// "2026-05-24" -> "24 may 2026". Falls back to the raw string if unparseable.
function formatCaptura(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS_ES[Number(mo) - 1] ?? mo;
  return `${Number(d)} ${month} ${y}`;
}

export default function PanelPage() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layer, setLayer] = useState<LayerKey>("ndvi");
  const [captura, setCaptura] = useState<string | null>(null);
  const [view, setView] = useState<"gestion" | "productor">("gestion");
  const [selected, setSelected] = useState<string | null>(null);
  const [deps, setDeps] = useState<DepartamentoProps[]>([]);
  const [serie, setSerie] = useState<number[]>([]);

  useEffect(() => {
    fetchDepartamentos().then(setDeps).catch(() => setDeps([]));
    fetchJson("/data/series-ndvi.json", SeriesSchema)
      .then((s) => setSerie(s["arauco"] ?? []))
      .catch(() => setSerie([]));
  }, []);

  const selectedDep = selected
    ? deps.find((d) => d.nombre === selected) ?? null
    : null;

  // Keep the map highlight layer in sync with the React selection.
  function applyHighlight(map: maplibregl.Map, nombre: string | null) {
    if (!map.getLayer("dep-highlight")) return;
    map.setFilter("dep-highlight", ["==", ["get", "nombre"], nombre ?? "__none__"]);
  }

  const handleReady = useCallback(async (map: maplibregl.Map) => {
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
    // Selected-department highlight: thick emerald/white outline, filtered by name.
    map.addLayer({
      id: "dep-highlight",
      type: "line",
      source: "departamentos",
      filter: ["==", ["get", "nombre"], "__none__"],
      paint: { "line-color": "#10b981", "line-width": 4 },
    });

    // Click a department to select it; hover shows a pointer cursor.
    const fillLayers = ["dep-ndvi", "dep-ndwi"];
    for (const id of fillLayers) {
      map.on("click", id, (e) => {
        const nombre = e.features?.[0]?.properties?.nombre;
        if (typeof nombre === "string") setSelected(nombre);
      });
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // Real Sentinel-2 NDVI snapshot over Aimogasta (defensive: skip if missing).
    try {
      const bounds = await fetch("/raster/aimogasta-ndvi-bounds.json").then((r) =>
        r.ok ? r.json() : null,
      );
      if (bounds) {
        map.addSource("aimogasta-ndvi", {
          type: "image",
          url: "/raster/aimogasta-ndvi.png",
          coordinates: bounds.coordinates,
        });
        map.addLayer({
          id: "aimogasta-ndvi",
          type: "raster",
          source: "aimogasta-ndvi",
          paint: { "raster-opacity": 0.8 },
        });
        if (typeof bounds.captura === "string") setCaptura(bounds.captura);
      }
    } catch (e) {
      console.warn("NDVI overlay skipped", e);
    }
  }, []);

  // Re-apply highlight whenever the selection changes (map may already be ready).
  useEffect(() => {
    const map = mapRef.current;
    if (map) applyHighlight(map, selected);
  }, [selected]);

  function handleToggle(k: LayerKey) {
    setLayer(k);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty("dep-ndvi", "visibility", k === "ndvi" ? "visible" : "none");
    map.setLayoutProperty("dep-ndwi", "visibility", k === "ndwi" ? "visible" : "none");
  }

  const capturaLabel = captura ? formatCaptura(captura) : "24 may 2026";

  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="flex items-center justify-between gap-4 bg-emerald-900 px-5 py-3 text-white shadow-md">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-lg font-semibold">
              Panel Territorial Agrícola · La Rioja
            </h1>
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-800/80 px-2.5 py-0.5 text-xs font-medium text-emerald-50 ring-1 ring-emerald-400/40 sm:inline-flex">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
              </span>
              🛰 Sentinel-2 · última captura {capturaLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs font-light text-emerald-200">
            Monitoreo satelital de salud de cultivos y estrés hídrico, por departamento
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-emerald-950 p-1 text-sm">
          <button
            type="button"
            onClick={() => setView("gestion")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              view === "gestion" ? "bg-white text-emerald-900" : "text-emerald-100 hover:bg-emerald-800"
            }`}
          >
            Gestión
          </button>
          <button
            type="button"
            onClick={() => setView("productor")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              view === "productor" ? "bg-white text-emerald-900" : "text-emerald-100 hover:bg-emerald-800"
            }`}
          >
            Productor
          </button>
        </div>
      </header>
      {view === "gestion" ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex-1">
            <MapShell center={[-67.2, -29.4]} zoom={6.3} onReady={handleReady} />
            <div className="absolute left-3 top-3 z-10">
              <LayerToggle active={layer} onChange={handleToggle} />
            </div>
            <div className="absolute bottom-3 left-3 z-10">
              <MapLegend layer={layer} />
            </div>
            <div className="absolute bottom-3 right-3 z-10 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
              🛰 Sentinel-2 · captura {capturaLabel}
            </div>
          </div>
          <aside className="flex w-80 flex-col gap-4 overflow-y-auto border-l border-gray-200 bg-white p-4">
            <DepartmentDetail
              dep={selectedDep}
              serie={serie}
              onClear={() => setSelected(null)}
            />
            <AggregateIndicators selected={selected} onSelect={setSelected} />
            <AlertsPanel />
            <ExportReportButton />
          </aside>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ProducerView />
        </div>
      )}
    </div>
  );
}

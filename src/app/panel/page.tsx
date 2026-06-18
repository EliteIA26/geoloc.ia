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
import InsightHero, { type HeroChip } from "@/components/insight-hero";
import { ndviToColor, ndwiToColor } from "@/lib/colors";
import { fetchDepartamentos, type DepartamentoProps } from "@/lib/departamentos";
import { fetchJson, SeriesSchema } from "@/lib/data";
import { RIESGO_LABEL, type RiesgoTipo } from "@/lib/agroclimate";
import TrendBadge from "@/components/trend-badge";
import { fetchSatelital, fetchProvinciaNdvi, snowCoverStatus, type Satelital, type ProvinciaNdvi } from "@/lib/satelital";
import ResizableAside from "@/components/resizable-aside";

// Shape of /api/resumen-territorial (verified live).
type ResumenTerritorial = {
  resumen: string;
  fuenteIA: boolean;
  deptosEnRiesgo: { nombre: string; riesgos: string[] }[];
  actualizado: string;
};

// Build hero chips by counting each risk type across all departments at risk,
// e.g. "Incendio en 9 deptos". All territorial risks render as the "alerta" tone.
function riesgoChips(deptos: ResumenTerritorial["deptosEnRiesgo"]): HeroChip[] {
  const counts = new Map<string, number>();
  for (const d of deptos) {
    for (const r of d.riesgos) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, n]) => ({
      label: `${RIESGO_LABEL[tipo as RiesgoTipo] ?? tipo} en ${n} ${n === 1 ? "depto" : "deptos"}`,
      tone: "alerta" as const,
    }));
}

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

// Short date/time for the resumen eyebrow + footer (es-AR). Defensive: returns
// "" if the timestamp is unparseable so the label degrades gracefully.
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
function horaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function PanelPage() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layer, setLayer] = useState<LayerKey>("ndvi");
  const [captura, setCaptura] = useState<string | null>(null);
  const [view, setView] = useState<"gestion" | "productor">("gestion");
  const [selected, setSelected] = useState<string | null>(null);
  const [deps, setDeps] = useState<DepartamentoProps[]>([]);
  const [serie, setSerie] = useState<number[]>([]);
  const [resumen, setResumen] = useState<ResumenTerritorial | null>(null);
  const [resumenEstado, setResumenEstado] = useState<"loading" | "ok" | "error">("loading");
  const [sat, setSat] = useState<Satelital | null>(null);
  const [prov, setProv] = useState<ProvinciaNdvi | null>(null);

  useEffect(() => {
    fetchDepartamentos().then(setDeps).catch(() => setDeps([]));
    fetchJson("/data/series-ndvi.json", SeriesSchema)
      .then((s) => setSerie(s["arauco"] ?? []))
      .catch(() => setSerie([]));
  }, []);

  // Territorial AI resumen for the Gestión hero. Fetched once on mount; the
  // route is slow (18 cached weather calls) so we keep an explicit loading state.
  useEffect(() => {
    let alive = true;
    fetch("/api/resumen-territorial")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ResumenTerritorial) => {
        if (!alive) return;
        setResumen(j);
        setResumenEstado("ok");
      })
      .catch(() => {
        if (alive) setResumenEstado("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    fetchSatelital().then(setSat);
  }, []);

  useEffect(() => {
    fetchProvinciaNdvi().then(setProv);
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
    // Near-transparent click target — sits over the raster so departments are still selectable.
    map.addLayer({
      id: "dep-ndvi",
      type: "fill",
      source: "departamentos",
      paint: { "fill-color": "#000000", "fill-opacity": 0.01 },
    });
    map.addLayer({
      id: "dep-ndwi",
      type: "fill",
      source: "departamentos",
      layout: { visibility: "none" },
      paint: { "fill-color": ["get", "colorNdwi"], "fill-opacity": 0.55 },
    });

    // Province-wide MODIS NDVI fade (under borders). Defensive.
    try {
      const lb = await fetch("/raster/larioja-ndvi-bounds.json").then((r) => (r.ok ? r.json() : null));
      if (lb) {
        map.addSource("larioja-ndvi", { type: "image", url: "/raster/larioja-ndvi.png", coordinates: lb.coordinates });
        map.addLayer({ id: "larioja-ndvi", type: "raster", source: "larioja-ndvi", paint: { "raster-opacity": 0.8 } });
      }
    } catch (e) { console.warn("province NDVI skipped", e); }

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
    // NDVI → show province raster; NDWI → hide raster + show flat NDWI fill.
    // The near-transparent dep-ndvi click layer stays visible always for selection.
    if (map.getLayer("larioja-ndvi")) {
      map.setLayoutProperty("larioja-ndvi", "visibility", k === "ndvi" ? "visible" : "none");
    }
    map.setLayoutProperty("dep-ndwi", "visibility", k === "ndwi" ? "visible" : "none");
  }

  const capturaLabel = captura ? formatCaptura(captura) : "24 may 2026";

  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col">
      {/* Softened editorial bar: light surface, ink title with an accent mark. */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg text-[var(--foreground)]">
            <span className="inline-block h-4 w-1 rounded-full bg-[var(--primary)]" aria-hidden />
            Panel Territorial Agrícola
            <span className="text-muted-foreground">· La Rioja</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Sentinel-2 · última captura {capturaLabel}
            </span>
            <p className="truncate text-xs text-muted-foreground">
              Monitoreo satelital de salud de cultivos y estrés hídrico, por departamento
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setView("gestion")}
            className={`rounded-md px-3 py-1 transition-colors ${
              view === "gestion"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-muted-foreground hover:text-[var(--foreground)]"
            }`}
          >
            Gestión
          </button>
          <button
            type="button"
            onClick={() => setView("productor")}
            className={`rounded-md px-3 py-1 transition-colors ${
              view === "productor"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-muted-foreground hover:text-[var(--foreground)]"
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
          </div>
          <ResizableAside>
            {/* Insight first: the territorial resumen opens the view. */}
            {resumenEstado === "loading" && (
              <div className="glass-panel p-5">
                <div className="mb-2.5 text-xs text-muted-foreground">Resumen de gestión · IA</div>
                <p className="text-sm text-muted-foreground">Analizando la provincia…</p>
              </div>
            )}
            {resumenEstado === "error" && (
              <div className="glass-panel p-5">
                <div className="mb-2.5 text-xs text-muted-foreground">Resumen de gestión</div>
                <p className="text-sm text-muted-foreground">Resumen territorial no disponible ahora.</p>
              </div>
            )}
            {resumenEstado === "ok" && resumen && (
              <InsightHero
                eyebrow={`Resumen de gestión · ${resumen.fuenteIA ? "IA" : "automático"} · ${fechaCorta(resumen.actualizado)}`}
                titulo={resumen.resumen}
                chips={riesgoChips(resumen.deptosEnRiesgo)}
                footer={`Clima: Open-Meteo · ${resumen.fuenteIA ? "análisis: IA" : "resumen automático"} · actualizado ${horaCorta(resumen.actualizado)}`}
              />
            )}
            {sat?.nieve && (
              <div className="glass-panel p-4">
                <div className="mb-1 text-xs text-muted-foreground">Reserva hídrica de montaña</div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      snowCoverStatus(sat.nieve.cobertura).nivel === "alerta"
                        ? "bg-red-500"
                        : snowCoverStatus(sat.nieve.cobertura).nivel === "atencion"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-lg text-[var(--foreground)]">
                    Nieve en la cordillera: {snowCoverStatus(sat.nieve.cobertura).valor}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {sat.nieve.region} · captura {sat.nieve.fecha}
                </div>
              </div>
            )}
            <DepartmentDetail
              dep={selectedDep}
              serie={serie}
              prov={prov}
              onClear={() => setSelected(null)}
            />
            {selected === "Arauco" && sat?.ndviTrend && (
              <TrendBadge actual={sat.ndviTrend.actual} anterior={sat.ndviTrend.anterior} />
            )}
            <AggregateIndicators selected={selected} onSelect={setSelected} prov={prov} />
            <AlertsPanel />
            <ExportReportButton />
          </ResizableAside>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ProducerView />
        </div>
      )}
    </div>
  );
}

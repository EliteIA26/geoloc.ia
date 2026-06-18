"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import MapShell from "@/components/premium/map-shell";
import LayerToggle, { type LayerKey } from "@/components/premium/layer-toggle";
import AggregateIndicators from "@/components/premium/aggregate-indicators";
import AlertsPanel from "@/components/premium/alerts-panel";
import ExportReportButton from "@/components/premium/export-report-button";
import ProducerView from "@/components/premium/producer-view";
import MapLegend from "@/components/premium/map-legend";
import RadialDepartmentView from "@/components/premium/radial-department-view";
import InsightHero, { type HeroChip } from "@/components/premium/insight-hero";
import { AnimatePresence } from "framer-motion";
import { ndviToColor, ndwiToColor } from "@/lib/colors";
import { fetchDepartamentos, type DepartamentoProps } from "@/lib/departamentos";
import { fetchJson, SeriesSchema } from "@/lib/data";
import { RIESGO_LABEL, type RiesgoTipo } from "@/lib/agroclimate";
import { fetchSatelital, fetchProvinciaNdvi, snowCoverStatus, type Satelital, type ProvinciaNdvi } from "@/lib/satelital";

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

function getBounds(geometry: GeoJSON.Geometry) {
  const bounds = new maplibregl.LngLatBounds();
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring) => {
      ring.forEach((coord) => bounds.extend(coord as [number, number]));
    });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) => {
      poly.forEach((ring) => {
        ring.forEach((coord) => bounds.extend(coord as [number, number]));
      });
    });
  }
  return bounds;
}

export default function PanelPage() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const orbitState = useRef({ isDragging: false, startX: 0, startY: 0, startBearing: 0, startPitch: 0 });
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


  // Derive the selected department object.
  const selectedDep = selected
    ? deps.find((d) => d.nombre === selected) ?? null
    : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selected) {
      // Remove gravity constraints when clearing
      map.setMaxBounds(null);
      map.dragPan.enable();
    } else {
      map.dragPan.disable(); // Disable normal panning so we can use left-click for orbiting
    }

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!selected || e.originalEvent.button !== 0) return;
      orbitState.current = {
        isDragging: true,
        startX: e.originalEvent.clientX,
        startY: e.originalEvent.clientY,
        startBearing: map.getBearing(),
        startPitch: map.getPitch()
      };
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!orbitState.current.isDragging || !selected) return;
      const dx = e.originalEvent.clientX - orbitState.current.startX;
      const dy = e.originalEvent.clientY - orbitState.current.startY;
      
      map.setBearing(orbitState.current.startBearing - dx * 0.4);
      let newPitch = orbitState.current.startPitch - dy * 0.4;
      if (newPitch > 85) newPitch = 85;
      if (newPitch < 0) newPitch = 0;
      map.setPitch(newPitch);
    };

    const onMouseUp = () => {
      orbitState.current.isDragging = false;
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selected]);

  // Keep the map highlight layer in sync with the React selection.
  function applyHighlight(map: maplibregl.Map, nombre: string | null) {
    if (!map.getLayer("dep-highlight")) return;
    map.setFilter("dep-highlight", ["==", ["get", "nombre"], nombre ?? "__none__"]);

    // Obfuscate non-selected departments
    if (map.getLayer("dep-obfuscate")) {
      if (nombre) {
        map.setFilter("dep-obfuscate", ["!=", ["get", "nombre"], nombre]);
      } else {
        map.setFilter("dep-obfuscate", ["==", ["get", "nombre"], "__none__"]);
      }
    }
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

    // Province-wide MODIS NDWI (humidity) — fluid raster like NDVI, sharing the
    // NDVI grid/bounds. Only added once the Action has generated the PNG; hidden
    // until the user toggles "Estrés hídrico". Falls back to the dep-ndwi fill below.
    try {
      const lb = await fetch("/raster/larioja-ndvi-bounds.json").then((r) => (r.ok ? r.json() : null));
      const hasPng = await fetch("/raster/larioja-ndwi.png", { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (lb && hasPng) {
        map.addSource("larioja-ndwi", { type: "image", url: "/raster/larioja-ndwi.png", coordinates: lb.coordinates });
        map.addLayer({ id: "larioja-ndwi", type: "raster", source: "larioja-ndwi", layout: { visibility: "none" }, paint: { "raster-opacity": 0.8 } });
      }
    } catch (e) { console.warn("province NDWI skipped", e); }

    // Obfuscation layer: darkens everything EXCEPT the selected department
    map.addLayer({
      id: "dep-obfuscate",
      type: "fill",
      source: "departamentos",
      filter: ["==", ["get", "nombre"], "__none__"],
      paint: { "fill-color": "#000000", "fill-opacity": 0.75 },
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
        const feature = e.features?.[0];
        const nombre = feature?.properties?.nombre;
        if (typeof nombre === "string") {
          setSelected(nombre);
          if (feature?.geometry) {
            const bounds = getBounds(feature.geometry);

            // Add slight margin to bounds so the user can see the edges
            const paddedBounds = new maplibregl.LngLatBounds(
              bounds.getSouthWest(), bounds.getNorthEast()
            );
            
            map.fitBounds(bounds, {
              padding: { top: 150, bottom: 150, left: 150, right: 150 }, // perfectly centered
              pitch: 65,
              bearing: Math.random() * 40 - 20, // dramatic random 3D tilt
              duration: 2000,
              essential: true
            });
            
            // Lock map panning to the department's boundaries
            setTimeout(() => {
               if (mapRef.current && nombre === selected) {
                 mapRef.current.setMaxBounds(paddedBounds);
               }
            }, 2000);
          }
        }
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
    if (map) {
      applyHighlight(map, selected);
      if (!selected) {
        // Reset 3D view
        map.flyTo({ center: [-67.2, -29.4], zoom: 6.3, pitch: 0, bearing: 0, duration: 1500 });
      }
    }
  }, [selected]);

  function handleToggle(k: LayerKey) {
    setLayer(k);
    const map = mapRef.current;
    if (!map) return;
    // NDVI and NDWI both render as fluid province rasters (larioja-ndvi / larioja-ndwi).
    // The discrete dep-ndwi fill is only a fallback when the NDWI raster isn't generated yet.
    // The near-transparent dep-ndvi click layer stays visible always for selection.
    const hasNdwiRaster = !!map.getLayer("larioja-ndwi");
    if (map.getLayer("larioja-ndvi")) {
      map.setLayoutProperty("larioja-ndvi", "visibility", k === "ndvi" ? "visible" : "none");
    }
    if (hasNdwiRaster) {
      map.setLayoutProperty("larioja-ndwi", "visibility", k === "ndwi" ? "visible" : "none");
    }
    if (map.getLayer("dep-ndwi")) {
      map.setLayoutProperty("dep-ndwi", "visibility", k === "ndwi" && !hasNdwiRaster ? "visible" : "none");
    }
  }

  const capturaLabel = captura ? formatCaptura(captura) : "24 may 2026";

  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden relative">
      {view === "gestion" ? (
        <>
          {/* Map is now full screen in the background */}
          <div className="absolute inset-0 z-0">
            <MapShell center={[-67.2, -29.4]} zoom={6.3} onReady={handleReady} />
          </div>

          {/* Floating UI Elements over the map */}
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
            
            {/* Top Bar - Floating Header */}
            <header className={`pointer-events-auto flex items-center justify-between gap-4 rounded-2xl glass-panel shadow-2xl px-5 py-3 mb-4 backdrop-blur-xl bg-card/60 transition-all duration-700 ${selected ? 'opacity-20 blur-sm pointer-events-none' : ''}`}>
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight text-foreground">
                  <span className="inline-block h-4 w-1 rounded-full bg-primary" aria-hidden />
                  Panel Territorial Agrícola
                  <span className="text-muted-foreground font-normal">· La Rioja</span>
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary font-medium border border-primary/20">
                    <span className="relative flex h-1.5 w-1.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    Sentinel-2 · captura {capturaLabel}
                  </span>
                  <p className="truncate text-xs text-muted-foreground">
                    Monitoreo satelital avançado
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1 rounded-xl bg-black/20 p-1 text-sm border border-border/50">
                <button
                  type="button"
                  onClick={() => setView("gestion")}
                  className={`rounded-lg px-4 py-1.5 transition-all duration-300 font-medium bg-primary text-primary-foreground shadow-md`}
                >
                  Gestión
                </button>
                <button
                  type="button"
                  onClick={() => setView("productor")}
                  className={`rounded-lg px-4 py-1.5 transition-all duration-300 font-medium text-muted-foreground hover:text-foreground hover:bg-white/5`}
                >
                  Productor
                </button>
              </div>
            </header>

            {/* Main Content Area: Map Controls (Left) and Bento Sidebar (Right) */}
            <div className="flex flex-1 items-start justify-between min-h-0">
              
              {/* Left Controls */}
              <div className={`pointer-events-auto flex flex-col gap-4 transition-all duration-700 ${selected ? 'opacity-20 blur-sm pointer-events-none' : ''}`}>
                <div className="w-fit glass-panel p-1 rounded-xl shadow-xl bg-card/60 backdrop-blur-xl">
                  <LayerToggle active={layer} onChange={handleToggle} />
                </div>
                {layer !== "none" && (
                  <div className="mt-auto pb-4 w-fit">
                    <div className="glass-panel rounded-xl shadow-xl bg-card/60 backdrop-blur-xl overflow-hidden">
                      <MapLegend layer={layer} />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar - Bento Box style */}
              {!selected && (
                <div className="pointer-events-auto h-full w-full max-w-[400px] flex flex-col gap-4 overflow-y-auto pb-4 custom-scrollbar pr-2 animate-in slide-in-from-right-8 duration-500">
                  
                  {/* AI Insight Hero */}
                  <div className="glass-panel rounded-2xl shadow-2xl bg-card/80 backdrop-blur-2xl border-border/50 overflow-hidden shrink-0 transition-all duration-500">
                    {resumenEstado === "loading" && (
                      <div className="p-5 flex flex-col gap-3">
                        <div className="text-xs text-primary font-medium flex items-center gap-2">
                          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span></span>
                          Analizando territorio IA...
                        </div>
                        <div className="space-y-2">
                          <div className="h-4 w-full bg-white/5 animate-pulse rounded"></div>
                          <div className="h-4 w-5/6 bg-white/5 animate-pulse rounded"></div>
                          <div className="h-4 w-4/6 bg-white/5 animate-pulse rounded"></div>
                        </div>
                      </div>
                    )}
                    {resumenEstado === "error" && (
                      <div className="p-5">
                        <div className="mb-2.5 text-xs text-muted-foreground">Resumen de gestión</div>
                        <p className="text-sm text-destructive">Resumen territorial não disponível agora.</p>
                      </div>
                    )}
                    {resumenEstado === "ok" && resumen && (
                      <InsightHero
                        eyebrow={`Resumo de Gestão · ${resumen.fuenteIA ? "IA" : "Automático"} · ${fechaCorta(resumen.actualizado)}`}
                        titulo={resumen.resumen}
                        chips={riesgoChips(resumen.deptosEnRiesgo)}
                        footer={`Clima: Open-Meteo · Análise IA · Atualizado ${horaCorta(resumen.actualizado)}`}
                      />
                    )}
                  </div>

                  {/* Snow Cover */}
                  {sat?.nieve && (
                    <div className="glass-panel p-5 rounded-2xl shadow-xl bg-card/70 backdrop-blur-xl border-border/50 shrink-0 transition-all duration-500">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reserva Hídrica de Montanha</div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-block h-3 w-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
                            snowCoverStatus(sat.nieve.cobertura).nivel === "alerta"
                              ? "bg-destructive shadow-destructive/50"
                              : snowCoverStatus(sat.nieve.cobertura).nivel === "atencion"
                                ? "bg-amber-500 shadow-amber-500/50"
                                : "bg-primary shadow-primary/50"
                          }`}
                        />
                        <span className="text-xl font-semibold tracking-tight text-foreground">
                          Nieve: {snowCoverStatus(sat.nieve.cobertura).valor}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-white/5">{sat.nieve.region}</span>
                        <span>·</span>
                        <span>Captura {sat.nieve.fecha}</span>
                      </div>
                    </div>
                  )}

                  <div className="shrink-0 glass-panel rounded-2xl bg-card/70 backdrop-blur-xl border-border/50 p-1 transition-all duration-500">
                    <AggregateIndicators selected={selected} onSelect={setSelected} prov={prov} />
                  </div>

                  <div className="shrink-0 transition-all duration-500">
                    <AlertsPanel />
                  </div>
                  
                  <div className="shrink-0 pb-2 transition-all duration-500">
                    <ExportReportButton />
                  </div>
                </div>
              )}
            </div>

            {/* Radial Full Screen HUD for Selected Department */}
            <AnimatePresence>
              {selected && (
                <RadialDepartmentView
                  key="radial-view"
                  dep={selectedDep}
                  serie={serie}
                  prov={prov}
                  sat={sat}
                  onClear={() => {
                    setSelected(null);
                    if (mapRef.current) mapRef.current.setMaxBounds(null);
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-hidden pointer-events-auto z-10 relative bg-background">
           <header className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-4 rounded-2xl glass-panel shadow-2xl px-5 py-3 mb-4 backdrop-blur-xl bg-card/60">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight text-foreground">
                  <span className="inline-block h-4 w-1 rounded-full bg-amber-500" aria-hidden />
                  Visão do Produtor
                </h1>
              </div>
              <div className="flex shrink-0 gap-1 rounded-xl bg-black/20 p-1 text-sm border border-border/50">
                <button
                  type="button"
                  onClick={() => setView("gestion")}
                  className={`rounded-lg px-4 py-1.5 transition-all duration-300 font-medium text-muted-foreground hover:text-foreground hover:bg-white/5`}
                >
                  Gestión
                </button>
                <button
                  type="button"
                  onClick={() => setView("productor")}
                  className={`rounded-lg px-4 py-1.5 transition-all duration-300 font-medium bg-amber-500 text-amber-950 shadow-md`}
                >
                  Productor
                </button>
              </div>
            </header>
          <ProducerView />
        </div>
      )}
      
      {/* Custom Scrollbar CSS for Bento Box Sidebar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}

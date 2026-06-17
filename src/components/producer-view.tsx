"use client";

import { useCallback, useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import MapShell from "@/components/map-shell";
import NdviTimeSeries from "@/components/ndvi-time-series";
import WaterStressBadge from "@/components/water-stress-badge";
import ForecastPanel from "@/components/forecast-panel";
import InsightHero, { type HeroChip } from "@/components/insight-hero";
import SignalGrid, { type Signal } from "@/components/signal-grid";
import { irrigationHint } from "@/lib/water-stress";
import { fetchJson, SeriesSchema } from "@/lib/data";
import type { Pronostico } from "@/lib/pronostico";
import { RIESGO_LABEL } from "@/lib/agroclimate";
import TrendBadge from "@/components/trend-badge";
import { fetchSatelital, type Satelital } from "@/lib/satelital";

type GeoJSONFeature = {
  properties: {
    id: string;
    nombre: string;
    ndvi: number;
    esMiFinca?: boolean;
  };
};

type GeoJSONCollection = {
  features: GeoJSONFeature[];
};

// Active risks become hero chips: alto -> alerta tone, medio/bajo -> atencion.
function riesgoChips(riesgos: Pronostico["riesgos"]): HeroChip[] {
  return riesgos.map((r) => ({
    label: `${RIESGO_LABEL[r.tipo] ?? r.tipo}`,
    tone: r.nivel === "alto" ? ("alerta" as const) : ("atencion" as const),
  }));
}

const FINCA_LAT = -27.823;
const FINCA_LON = -66.785;

export default function ProducerView() {
  const [serie, setSerie] = useState<number[]>([]);
  const [data, setData] = useState<Pronostico | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [sat, setSat] = useState<Satelital | null>(null);

  useEffect(() => {
    fetchJson("/data/series-ndvi.json", SeriesSchema)
      .then((s) => setSerie(s["finca-aimogasta-1"] ?? []))
      .catch(() => setSerie([]));
  }, []);

  useEffect(() => {
    fetchSatelital().then(setSat);
  }, []);

  const last = serie.at(-1) ?? 0.5;

  // Single /api/pronostico fetch shared by the hero, signal grid and forecast
  // panel. Re-runs when the latest NDVI changes (affects the water-deficit risk).
  useEffect(() => {
    let alive = true;
    fetch(`/api/pronostico?lat=${FINCA_LAT}&lon=${FINCA_LON}&ndvi=${last}&crop=olivo`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Pronostico) => {
        if (!alive) return;
        setData(j);
        setEstado("ok");
      })
      .catch(() => {
        if (alive) setEstado("error");
      });
    return () => {
      alive = false;
    };
  }, [last]);

  const addFincaLayers = useCallback(async (map: maplibregl.Map) => {
    const gj = (await fetch("/data/fincas-aimogasta.geojson").then((r) => r.json())) as GeoJSONCollection;
    map.addSource("fincas", { type: "geojson", data: gj as unknown as maplibregl.GeoJSONSourceSpecification["data"] });
    map.addLayer({
      id: "fincas",
      type: "fill",
      source: "fincas",
      paint: {
        "fill-color": ["case", ["==", ["get", "esMiFinca"], true], "#2563eb", "#9ca3af"],
        "fill-opacity": 0.5,
      },
    });
    try {
      const bounds = await fetch("/raster/aimogasta-ndvi-bounds.json").then((r) => (r.ok ? r.json() : null));
      if (bounds) {
        map.addSource("finca-ndvi", { type: "image", url: "/raster/aimogasta-ndvi.png", coordinates: bounds.coordinates });
        map.addLayer({ id: "finca-ndvi", type: "raster", source: "finca-ndvi", paint: { "raster-opacity": 0.8 } });
      }
    } catch (e) {
      console.warn("NDVI overlay skipped", e);
    }
  }, []);

  // Signals from the route + NDMI (vegetation moisture) from the satellite
  // snapshot when available (Incremento 2). Both degrade gracefully if absent.
  const signals: Signal[] = [
    ...(data?.senales ?? []).map((s) => ({ etiqueta: s.etiqueta, valor: s.valor, nivel: s.nivel })),
    ...(sat?.ndmiAimogasta != null
      ? [
          {
            etiqueta: "Humedad vegetación (NDMI)",
            valor: sat.ndmiAimogasta.toFixed(2),
            nivel: (sat.ndmiAimogasta < 0.1
              ? "alerta"
              : sat.ndmiAimogasta < 0.2
                ? "atencion"
                : "ok") as Signal["nivel"],
          },
        ]
      : []),
  ];

  return (
    <div className="ed-page flex h-full">
      <div className="relative flex-1">
        <div className="absolute left-2 top-2 z-10 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-medium text-amber-950">
          Preview · Fase 2
        </div>
        <MapShell center={[-66.77, -27.83]} zoom={12.5} onReady={addFincaLayers} />
      </div>
      <aside className="ed-page w-80 space-y-4 overflow-y-auto border-l border-[var(--hairline)] p-4">
        <div>
          <p className="text-[11px] ed-faint">Productor</p>
          <h2 className="text-base text-[var(--ink)]">Mi finca · Aimogasta</h2>
          {sat?.ndviTrend && (
            <div className="mt-1.5">
              <TrendBadge actual={sat.ndviTrend.actual} anterior={sat.ndviTrend.anterior} />
            </div>
          )}
        </div>

        {/* Insight first: the forecast recommendation opens the view. */}
        {estado === "loading" && (
          <div className="ed-card p-5">
            <div className="mb-2.5 text-xs ed-faint">Recomendación · pronóstico</div>
            <p className="text-sm ed-faint">Calculando recomendación…</p>
          </div>
        )}
        {estado === "error" && (
          <div className="ed-card p-5">
            <div className="mb-2.5 text-xs ed-faint">Recomendación</div>
            <p className="text-sm ed-soft">Recomendación no disponible ahora.</p>
          </div>
        )}
        {estado === "ok" && data && (
          <>
            <InsightHero
              eyebrow={`Recomendación · ${data.fuenteIA ? "IA" : "automática"} · próximos 7 días`}
              titulo={data.recomendacion}
              chips={riesgoChips(data.riesgos)}
              footer={`Clima: Open-Meteo · ${data.fuenteIA ? "análisis: IA" : "recomendación automática"}`}
            />
            <SignalGrid signals={signals} />
          </>
        )}

        <div className="ed-card space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm ed-soft">
            Estrés hídrico actual: <WaterStressBadge index={last} />
          </div>
          <NdviTimeSeries values={serie} />
          <p className="text-sm ed-soft">{irrigationHint(last)}</p>
        </div>

        <ForecastPanel data={data} estado={estado} />
      </aside>
    </div>
  );
}

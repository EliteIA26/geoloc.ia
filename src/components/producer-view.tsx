"use client";

import { useCallback, useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import MapShell from "@/components/map-shell";
import NdviTimeSeries from "@/components/ndvi-time-series";
import WaterStressBadge from "@/components/water-stress-badge";
import { irrigationHint } from "@/lib/water-stress";
import { fetchJson, SeriesSchema } from "@/lib/data";

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

export default function ProducerView() {
  const [serie, setSerie] = useState<number[]>([]);
  useEffect(() => {
    fetchJson("/data/series-ndvi.json", SeriesSchema).then((s) =>
      setSerie(s["finca-aimogasta-1"] ?? []),
    );
  }, []);
  const last = serie.at(-1) ?? 0;

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

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <div className="absolute left-2 top-2 z-10 rounded bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950">
          Preview · Fase 2
        </div>
        <MapShell center={[-66.77, -27.83]} zoom={12.5} onReady={addFincaLayers} />
      </div>
      <aside className="w-80 space-y-4 overflow-y-auto bg-white p-3">
        <h2 className="text-sm font-semibold text-emerald-900">Mi finca · Aimogasta</h2>
        <div className="flex items-center gap-2 text-sm">
          Estrés hídrico actual: <WaterStressBadge index={last} />
        </div>
        <NdviTimeSeries values={serie} />
        <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">{irrigationHint(last)}</p>
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import MapShell from "@/components/map-shell";
import ResizableAside from "@/components/resizable-aside";
import BriefingChapter from "@/components/territorial/briefing-chapter";
import {
  composeVinchinaSatelliteIndicators,
  fetchTerritorial,
  fetchVinchinaSatelital,
  type Indicador,
  type Territorial,
  type VinchinaSatelital,
} from "@/lib/territorial";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable" };

type ImageCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

const DEPARTMENTS_SOURCE = "bermejo-departments";
const NDVI_SOURCE = "vinchina-ndvi";
const CORRIDOR_SOURCE = "pircas-negras-corridor";
const LOCALITIES_SOURCE = "vinchina-localities";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGeoJsonObject(value: unknown): value is GeoJSON {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return [
    "Feature",
    "FeatureCollection",
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
  ].includes(value.type);
}

function isImageCoordinates(value: unknown): value is ImageCoordinates {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(
          (coordinate) =>
            typeof coordinate === "number" && Number.isFinite(coordinate),
        ),
    )
  );
}

async function fetchGeoJson(url: string): Promise<GeoJSON> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isGeoJsonObject(payload)) {
    throw new Error(`${url} no contiene GeoJSON válido`);
  }
  return payload;
}

async function ensureGeoJsonSource(
  map: maplibregl.Map,
  id: string,
  url: string,
): Promise<void> {
  if (map.getSource(id)) return;
  map.addSource(id, { type: "geojson", data: await fetchGeoJson(url) });
}

async function addDepartmentContext(map: maplibregl.Map): Promise<void> {
  await ensureGeoJsonSource(
    map,
    DEPARTMENTS_SOURCE,
    "/data/bermejo-deptos.geojson",
  );
  if (!map.getLayer("bermejo-departments-fill")) {
    map.addLayer({
      id: "bermejo-departments-fill",
      type: "fill",
      source: DEPARTMENTS_SOURCE,
      paint: {
        "fill-color": "#334155",
        "fill-opacity": 0.3,
      },
    });
  }
}

async function addNdviOverlay(map: maplibregl.Map): Promise<void> {
  const [boundsResponse, imageResponse] = await Promise.all([
    fetch("/raster/vinchina-ndvi-bounds.json"),
    fetch("/raster/vinchina-ndvi.png"),
  ]);
  if (!boundsResponse.ok) {
    throw new Error(`límites NDVI respondieron ${boundsResponse.status}`);
  }
  if (!imageResponse.ok) {
    throw new Error(`imagen NDVI respondió ${imageResponse.status}`);
  }

  const boundsPayload: unknown = await boundsResponse.json();
  if (
    !isRecord(boundsPayload) ||
    !isImageCoordinates(boundsPayload.coordinates)
  ) {
    throw new Error("límites NDVI inválidos");
  }

  if (!map.getSource(NDVI_SOURCE)) {
    map.addSource(NDVI_SOURCE, {
      type: "image",
      url: "/raster/vinchina-ndvi.png",
      coordinates: boundsPayload.coordinates,
    });
  }
  if (!map.getLayer("vinchina-ndvi-raster")) {
    map.addLayer({
      id: "vinchina-ndvi-raster",
      type: "raster",
      source: NDVI_SOURCE,
      paint: { "raster-opacity": 0.85 },
    });
  }
}

async function addDepartmentBorders(map: maplibregl.Map): Promise<void> {
  await ensureGeoJsonSource(
    map,
    DEPARTMENTS_SOURCE,
    "/data/bermejo-deptos.geojson",
  );
  if (!map.getLayer("bermejo-departments-outline")) {
    map.addLayer({
      id: "bermejo-departments-outline",
      type: "line",
      source: DEPARTMENTS_SOURCE,
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.8,
        "line-width": 1,
      },
    });
  }
  if (!map.getLayer("vinchina-highlight")) {
    map.addLayer({
      id: "vinchina-highlight",
      type: "line",
      source: DEPARTMENTS_SOURCE,
      filter: ["==", ["get", "nombre"], "Vinchina"],
      paint: {
        "line-color": "#10b981",
        "line-width": 3,
      },
    });
  }
}

async function addCorridor(map: maplibregl.Map): Promise<void> {
  await ensureGeoJsonSource(
    map,
    CORRIDOR_SOURCE,
    "/data/corredor-pircas-negras.geojson",
  );
  if (!map.getLayer("pircas-negras-corridor")) {
    map.addLayer({
      id: "pircas-negras-corridor",
      type: "line",
      source: CORRIDOR_SOURCE,
      paint: {
        "line-color": "#f59e0b",
        "line-width": 3,
        "line-dasharray": [2, 2],
      },
    });
  }
}

async function addLocalities(map: maplibregl.Map): Promise<void> {
  await ensureGeoJsonSource(
    map,
    LOCALITIES_SOURCE,
    "/data/vinchina-localidades.geojson",
  );
  if (!map.getLayer("vinchina-localities")) {
    map.addLayer({
      id: "vinchina-localities",
      type: "circle",
      source: LOCALITIES_SOURCE,
      paint: {
        "circle-color": "#38bdf8",
        "circle-radius": 6,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }
}

async function safelyAdd(
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn(`No se pudo cargar ${label}.`, error);
  }
}

async function configureTerritorialMap(map: maplibregl.Map): Promise<void> {
  map.easeTo({
    center: [-68.72, -28.35],
    zoom: 7.1,
    pitch: 56,
    bearing: 18,
    duration: 1_800,
  });

  await safelyAdd("el contexto departamental", () =>
    addDepartmentContext(map),
  );
  await safelyAdd("la capa NDVI de Vinchina", () => addNdviOverlay(map));
  await safelyAdd("los bordes departamentales", () =>
    addDepartmentBorders(map),
  );
  await safelyAdd("el corredor a Pircas Negras", () => addCorridor(map));
  await safelyAdd("las localidades de Vinchina", () => addLocalities(map));
}

function EmptySatelliteChapter({ message }: { message: string }) {
  return (
    <section className="space-y-2" aria-live="polite">
      <h3 className="text-sm text-foreground">
        <span className="text-muted-foreground">2.</span> Producción observada
        (satélite)
      </h3>
      <p className="rounded-xl border border-[var(--border)] bg-card p-3 text-sm text-muted-foreground">
        {message}
      </p>
    </section>
  );
}

function TerritorialBriefing({
  territorial,
  satellite,
}: {
  territorial: Territorial;
  satellite: LoadState<VinchinaSatelital>;
}) {
  const satelliteIndicators: Indicador[] = [
    ...territorial.satelite,
    ...(satellite.status === "ready"
      ? composeVinchinaSatelliteIndicators(satellite.data)
      : []),
  ];

  return (
    <div className="space-y-5">
      <BriefingChapter
        numero={1}
        titulo="Contexto socio-productivo"
        indicadores={territorial.contexto}
      />
      {satelliteIndicators.length > 0 ? (
        <BriefingChapter
          numero={2}
          titulo="Producción observada (satélite)"
          indicadores={satelliteIndicators}
        />
      ) : satellite.status === "loading" ? (
        <EmptySatelliteChapter message="Cargando observación satelital…" />
      ) : (
        <EmptySatelliteChapter message="La observación satelital no está disponible en este momento." />
      )}
      <BriefingChapter
        numero={3}
        titulo="Logística y conexión con Chile"
        indicadores={territorial.chile}
      />
    </div>
  );
}

export default function BermejoPage() {
  const [territorial, setTerritorial] = useState<LoadState<Territorial>>({
    status: "loading",
  });
  const [satellite, setSatellite] = useState<LoadState<VinchinaSatelital>>({
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    void fetchTerritorial().then(
      (data) => {
        if (!active) return;
        setTerritorial(
          data ? { status: "ready", data } : { status: "unavailable" },
        );
      },
      () => {
        if (active) setTerritorial({ status: "unavailable" });
      },
    );

    void fetchVinchinaSatelital().then(
      (data) => {
        if (!active) return;
        setSatellite(
          data ? { status: "ready", data } : { status: "unavailable" },
        );
      },
      () => {
        if (active) setSatellite({ status: "unavailable" });
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    void configureTerritorialMap(map);
  }, []);

  return (
    <main className="flex h-dvh min-h-[640px] w-full overflow-hidden bg-background">
      <section
        className="relative min-w-0 flex-1"
        aria-label="Mapa territorial del Valle del Bermejo"
      >
        <MapShell center={[-68.72, -28.35]} zoom={7.1} onReady={handleMapReady} />
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-xs font-medium tracking-wide text-white shadow-lg backdrop-blur-md">
          Inteligencia territorial · Valle del Bermejo
        </div>
      </section>

      <ResizableAside>
        <header className="space-y-2 border-b border-[var(--border)] pb-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            Plan de Desarrollo Productivo · Valle del Bermejo
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Vinchina · Valle del Bermejo
          </h2>
          {territorial.status === "ready" ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {territorial.data.resumen ?? "Resumen territorial no disponible."}
            </p>
          ) : territorial.status === "loading" ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Cargando resumen territorial…
            </p>
          ) : (
            <p className="text-sm text-amber-300" role="status">
              Resumen territorial no disponible en este momento.
            </p>
          )}
        </header>

        {territorial.status === "ready" ? (
          <TerritorialBriefing
            territorial={territorial.data}
            satellite={satellite}
          />
        ) : territorial.status === "loading" ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Cargando briefing territorial…
          </p>
        ) : (
          <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
            La información territorial no está disponible en este momento.
          </p>
        )}
      </ResizableAside>
    </main>
  );
}

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
import {
  findLayerInsertionPoint,
  startBermejoAssetRequests,
  type AssetResult,
  type BermejoLayerId,
  type NdviAsset,
} from "@/lib/bermejo-map";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable" };

const DEPARTMENTS_SOURCE = "bermejo-departments";
const NDVI_SOURCE = "vinchina-ndvi";
const CORRIDOR_SOURCE = "pircas-negras-corridor";
const LOCALITIES_SOURCE = "vinchina-localities";

function ensureGeoJsonSource(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON,
): void {
  if (map.getSource(id)) return;
  map.addSource(id, { type: "geojson", data });
}

function insertionPoint(
  map: maplibregl.Map,
  layerId: BermejoLayerId,
): BermejoLayerId | undefined {
  return findLayerInsertionPoint(layerId, (candidate) =>
    Boolean(map.getLayer(candidate)),
  );
}

function addDepartmentLayers(map: maplibregl.Map, data: GeoJSON): void {
  ensureGeoJsonSource(map, DEPARTMENTS_SOURCE, data);
  if (!map.getLayer("bermejo-departments-fill")) {
    map.addLayer(
      {
        id: "bermejo-departments-fill",
        type: "fill",
        source: DEPARTMENTS_SOURCE,
        paint: {
          "fill-color": "#334155",
          "fill-opacity": 0.3,
        },
      },
      insertionPoint(map, "bermejo-departments-fill"),
    );
  }
  if (!map.getLayer("bermejo-departments-outline")) {
    map.addLayer(
      {
        id: "bermejo-departments-outline",
        type: "line",
        source: DEPARTMENTS_SOURCE,
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.8,
          "line-width": 1,
        },
      },
      insertionPoint(map, "bermejo-departments-outline"),
    );
  }
  if (!map.getLayer("vinchina-highlight")) {
    map.addLayer(
      {
        id: "vinchina-highlight",
        type: "line",
        source: DEPARTMENTS_SOURCE,
        filter: ["==", ["get", "nombre"], "Vinchina"],
        paint: {
          "line-color": "#10b981",
          "line-width": 3,
        },
      },
      insertionPoint(map, "vinchina-highlight"),
    );
  }
}

function addNdviOverlay(map: maplibregl.Map, data: NdviAsset): void {
  if (!map.getSource(NDVI_SOURCE)) {
    map.addSource(NDVI_SOURCE, {
      type: "image",
      url: data.imageUrl,
      coordinates: data.coordinates,
    });
  }
  if (!map.getLayer("vinchina-ndvi-raster")) {
    map.addLayer(
      {
        id: "vinchina-ndvi-raster",
        type: "raster",
        source: NDVI_SOURCE,
        paint: { "raster-opacity": 0.85 },
      },
      insertionPoint(map, "vinchina-ndvi-raster"),
    );
  }
}

function addCorridor(map: maplibregl.Map, data: GeoJSON): void {
  ensureGeoJsonSource(map, CORRIDOR_SOURCE, data);
  if (!map.getLayer("pircas-negras-corridor")) {
    map.addLayer(
      {
        id: "pircas-negras-corridor",
        type: "line",
        source: CORRIDOR_SOURCE,
        paint: {
          "line-color": "#f59e0b",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      },
      insertionPoint(map, "pircas-negras-corridor"),
    );
  }
}

function addLocalities(map: maplibregl.Map, data: GeoJSON): void {
  ensureGeoJsonSource(map, LOCALITIES_SOURCE, data);
  if (!map.getLayer("vinchina-localities")) {
    map.addLayer(
      {
        id: "vinchina-localities",
        type: "circle",
        source: LOCALITIES_SOURCE,
        paint: {
          "circle-color": "#38bdf8",
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      insertionPoint(map, "vinchina-localities"),
    );
  }
}

async function applyAsset<T>(
  request: Promise<AssetResult<T>>,
  map: maplibregl.Map,
  signal: AbortSignal,
  label: string,
  required: boolean,
  apply: (map: maplibregl.Map, data: T) => void,
  onRequiredFailure: () => void,
): Promise<void> {
  const result = await request;
  if (signal.aborted) return;

  if (result.status === "failed") {
    console.warn(`No se pudo cargar ${label}.`, result.error);
    if (required) onRequiredFailure();
    return;
  }

  try {
    apply(map, result.data);
  } catch (error) {
    console.warn(`No se pudo cargar ${label}.`, error);
    if (required) onRequiredFailure();
  }
}

async function configureTerritorialMap(
  map: maplibregl.Map,
  signal: AbortSignal,
  onRequiredFailure: () => void,
): Promise<void> {
  const requests = startBermejoAssetRequests(signal);

  map.easeTo({
    center: [-68.72, -28.35],
    zoom: 7.1,
    pitch: 56,
    bearing: 18,
    duration: 1_800,
  });

  await Promise.all([
    applyAsset(
      requests.departments,
      map,
      signal,
      "el contexto departamental",
      true,
      addDepartmentLayers,
      onRequiredFailure,
    ),
    applyAsset(
      requests.ndvi,
      map,
      signal,
      "la capa NDVI de Vinchina",
      false,
      addNdviOverlay,
      onRequiredFailure,
    ),
    applyAsset(
      requests.corridor,
      map,
      signal,
      "el corredor a Pircas Negras",
      true,
      addCorridor,
      onRequiredFailure,
    ),
    applyAsset(
      requests.localities,
      map,
      signal,
      "las localidades de Vinchina",
      true,
      addLocalities,
      onRequiredFailure,
    ),
  ]);
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
  const [mapWarning, setMapWarning] = useState<string | null>(null);

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
    const controller = new AbortController();
    map.once("remove", () => controller.abort());
    setMapWarning(null);
    void configureTerritorialMap(map, controller.signal, () => {
      if (!controller.signal.aborted) {
        setMapWarning(
          "Algunas capas vectoriales no pudieron cargarse. El resto del mapa sigue disponible.",
        );
      }
    });
  }, []);

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background md:flex-row">
      <h1 className="sr-only">Inteligencia territorial del Valle del Bermejo</h1>
      <section
        className="relative h-[55dvh] min-h-0 shrink-0 md:h-auto md:min-w-0 md:flex-1"
        aria-label="Mapa territorial del Valle del Bermejo"
      >
        <MapShell center={[-68.72, -28.35]} zoom={7.1} onReady={handleMapReady} />
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-xs font-medium tracking-wide text-white shadow-lg backdrop-blur-md">
          Inteligencia territorial · Valle del Bermejo
        </div>
        {mapWarning && (
          <p
            className="absolute bottom-3 left-3 right-3 z-10 max-w-md rounded-lg border border-amber-300/25 bg-black/75 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md"
            role="status"
          >
            {mapWarning}
          </p>
        )}
      </section>

      <ResizableAside responsiveStack>
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

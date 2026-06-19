import type { Feature, GeoJSON, Geometry, Position } from "geojson";

export type ImageCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export type AssetResult<T> =
  | { status: "ready"; data: T }
  | { status: "failed"; error: unknown };

export type NdviAsset = {
  coordinates: ImageCoordinates;
  imageUrl: string;
};

export type BermejoAssetRequests = {
  departments: Promise<AssetResult<GeoJSON>>;
  corridor: Promise<AssetResult<GeoJSON>>;
  localities: Promise<AssetResult<GeoJSON>>;
  ndvi: Promise<AssetResult<NdviAsset>>;
};

export const BERMEJO_LAYER_ORDER = [
  "bermejo-departments-fill",
  "vinchina-ndvi-raster",
  "bermejo-departments-outline",
  "vinchina-highlight",
  "pircas-negras-corridor",
  "vinchina-localities",
] as const;
export type BermejoLayerId = (typeof BERMEJO_LAYER_ORDER)[number];

export function findLayerInsertionPoint(
  layerId: BermejoLayerId,
  hasLayer: (id: BermejoLayerId) => boolean,
): BermejoLayerId | undefined {
  const layerIndex = BERMEJO_LAYER_ORDER.indexOf(layerId);
  return BERMEJO_LAYER_ORDER.slice(layerIndex + 1).find(hasLayer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function isPositionArray(value: unknown): value is Position[] {
  return (
    Array.isArray(value) && value.every((position) => isPosition(position))
  );
}

function isPositionArray2D(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.every(isPositionArray);
}

function isPositionArray3D(value: unknown): value is Position[][][] {
  return Array.isArray(value) && value.every(isPositionArray2D);
}

function isGeometry(value: unknown): value is Geometry {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "Point":
      return isPosition(value.coordinates);
    case "MultiPoint":
      return isPositionArray(value.coordinates);
    case "LineString":
      return (
        isPositionArray(value.coordinates) && value.coordinates.length >= 2
      );
    case "MultiLineString":
      return (
        isPositionArray2D(value.coordinates) &&
        value.coordinates.every((line) => line.length >= 2)
      );
    case "Polygon":
      return isPositionArray2D(value.coordinates);
    case "MultiPolygon":
      return isPositionArray3D(value.coordinates);
    case "GeometryCollection":
      return (
        Array.isArray(value.geometries) && value.geometries.every(isGeometry)
      );
    default:
      return false;
  }
}

function isFeature(value: unknown): value is Feature {
  return (
    isRecord(value) &&
    value.type === "Feature" &&
    "properties" in value &&
    (value.properties === null || isRecord(value.properties)) &&
    "geometry" in value &&
    (value.geometry === null || isGeometry(value.geometry))
  );
}

export function isGeoJson(value: unknown): value is GeoJSON {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "Feature") return isFeature(value);
  if (value.type === "FeatureCollection") {
    return Array.isArray(value.features) && value.features.every(isFeature);
  }
  return isGeometry(value);
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

async function fetchGeoJson(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<GeoJSON> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);

  const payload: unknown = await response.json();
  if (!isGeoJson(payload)) throw new Error(`${url} no contiene GeoJSON válido`);
  return payload;
}

async function fetchImageCoordinates(
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<ImageCoordinates> {
  const url = "/raster/vinchina-ndvi-bounds.json";
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isImageCoordinates(payload.coordinates)) {
    throw new Error(`${url} no contiene límites válidos`);
  }
  return payload.coordinates;
}

async function checkImage(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(url, { method: "HEAD", signal });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
}

function settle<T>(promise: Promise<T>): Promise<AssetResult<T>> {
  return promise.then(
    (data) => ({ status: "ready", data }),
    (error: unknown) => ({ status: "failed", error }),
  );
}

export function startBermejoAssetRequests(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): BermejoAssetRequests {
  const departments = settle(
    fetchGeoJson("/data/bermejo-deptos.geojson", signal, fetcher),
  );
  const corridor = settle(
    fetchGeoJson("/data/corredor-pircas-negras.geojson", signal, fetcher),
  );
  const localities = settle(
    fetchGeoJson("/data/vinchina-localidades.geojson", signal, fetcher),
  );
  const coordinates = fetchImageCoordinates(signal, fetcher);
  const imageUrl = "/raster/vinchina-ndvi.png";
  const imageExists = checkImage(imageUrl, signal, fetcher);
  const ndvi = settle(
    Promise.all([coordinates, imageExists]).then(([resolvedCoordinates]) => ({
      coordinates: resolvedCoordinates,
      imageUrl,
    })),
  );

  return { departments, corridor, localities, ndvi };
}

import { describe, expect, it } from "vitest";
import {
  findLayerInsertionPoint,
  isGeoJson,
  startBermejoAssetRequests,
} from "./bermejo-map";

const emptyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
} as const;

describe("isGeoJson", () => {
  it("validates FeatureCollection, Feature, and Geometry top-level shapes", () => {
    expect(isGeoJson(emptyFeatureCollection)).toBe(true);
    expect(
      isGeoJson({
        type: "Feature",
        properties: { nombre: "Vinchina" },
        geometry: { type: "Point", coordinates: [-68.2, -28.75] },
      }),
    ).toBe(true);
    expect(isGeoJson({ type: "Point", coordinates: [-68.2, -28.75] })).toBe(
      true,
    );

    expect(isGeoJson({ type: "FeatureCollection" })).toBe(false);
    expect(isGeoJson({ type: "Feature", properties: {} })).toBe(false);
    expect(isGeoJson({ type: "Point" })).toBe(false);
  });
});

describe("startBermejoAssetRequests", () => {
  it("starts every request concurrently with one abort signal and HEAD for the PNG", async () => {
    const controller = new AbortController();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = (input, init) => {
      calls.push({ url: String(input), init });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };

    const requests = startBermejoAssetRequests(controller.signal, fetcher);

    expect(calls).toHaveLength(5);
    expect(calls.every((call) => call.init?.signal === controller.signal)).toBe(
      true,
    );
    expect(
      calls.find((call) => call.url.endsWith("vinchina-ndvi.png"))?.init
        ?.method,
    ).toBe("HEAD");

    controller.abort();
    await Promise.all([
      requests.departments,
      requests.corridor,
      requests.localities,
      requests.ndvi,
    ]);
  });

  it("keeps vector assets available when the optional NDVI image fails", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("vinchina-ndvi.png")) {
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("vinchina-ndvi-bounds.json")) {
        return Response.json({
          coordinates: [
            [-68.4, -28.6],
            [-68.05, -28.6],
            [-68.05, -28.9],
            [-68.4, -28.9],
          ],
        });
      }
      return Response.json(emptyFeatureCollection);
    };

    const requests = startBermejoAssetRequests(
      new AbortController().signal,
      fetcher,
    );
    const [departments, corridor, localities, ndvi] = await Promise.all([
      requests.departments,
      requests.corridor,
      requests.localities,
      requests.ndvi,
    ]);

    expect(departments.status).toBe("ready");
    expect(corridor.status).toBe("ready");
    expect(localities.status).toBe("ready");
    expect(ndvi.status).toBe("failed");
  });
});

describe("findLayerInsertionPoint", () => {
  it("places a late layer before the first loaded layer above it", () => {
    const loaded = new Set([
      "bermejo-departments-outline",
      "pircas-negras-corridor",
      "vinchina-localities",
    ]);

    expect(
      findLayerInsertionPoint("vinchina-ndvi-raster", (id) => loaded.has(id)),
    ).toBe("bermejo-departments-outline");
    expect(
      findLayerInsertionPoint("bermejo-departments-fill", (id) =>
        loaded.has(id),
      ),
    ).toBe("bermejo-departments-outline");
    expect(
      findLayerInsertionPoint("vinchina-localities", (id) => loaded.has(id)),
    ).toBeUndefined();
  });
});

import { z } from "zod";
import type { GeoJSON } from "geojson";

export const LimitesSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.object({ id: z.string(), nombre: z.string(), fonte: z.string() }),
      geometry: z.object({ type: z.string() }).passthrough(),
    }),
  ),
});

export async function fetchLimites(): Promise<GeoJSON | null> {
  try {
    const res = await fetch("/data/bermejo-limites.geojson");
    if (!res.ok) return null;
    const json = await res.json();
    LimitesSchema.parse(json);
    return json as GeoJSON;
  } catch {
    return null;
  }
}

import { z } from "zod";

// Shape of each department feature in public/data/departamentos.geojson.
// fuente: "satelital" = measured from a real Sentinel scene, "referencia" = baseline estimate.
export const DepartamentoPropsSchema = z.object({
  nombre: z.string(),
  ndvi: z.number(),
  ndwi: z.number(),
  fuente: z.enum(["satelital", "referencia"]),
});
export type DepartamentoProps = z.infer<typeof DepartamentoPropsSchema>;

const DepartamentosGeoJSONSchema = z.object({
  features: z.array(z.object({ properties: DepartamentoPropsSchema })),
});

// Loads the real-boundary department dataset and returns just the properties we
// surface in the sidebar (the page itself keeps the full geojson for the map).
export async function fetchDepartamentos(
  path = "/data/departamentos.geojson",
): Promise<DepartamentoProps[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const parsed = DepartamentosGeoJSONSchema.parse(await res.json());
  return parsed.features.map((f) => f.properties);
}

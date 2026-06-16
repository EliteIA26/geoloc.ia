import { z } from "zod";

export const AlertasSchema = z.array(
  z.object({
    zona: z.string(),
    tipo: z.enum(["sequia", "helada"]),
    severidad: z.enum(["baja", "media", "alta"]),
    detalle: z.string(),
  }),
);
export type Alerta = z.infer<typeof AlertasSchema>[number];

export const SeriesSchema = z.record(z.string(), z.array(z.number()));
export type Series = z.infer<typeof SeriesSchema>;

export async function fetchJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return schema.parse(await res.json());
}

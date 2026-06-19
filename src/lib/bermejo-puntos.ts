import { z } from "zod";

export const PuntoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(["localidad", "atractivo"]),
  eje: z.enum(["turismo", "logistica", "poblacion"]),
  coordinates: z.tuple([z.number(), z.number()]),
  foto: z.string().nullable(),
  credito: z.string().optional(),
  descripcion: z.string(),
  datos: z.array(z.string()),
  fonte: z.string(),
  confianza: z.enum(["oficial", "observado", "estimado", "declarado"]),
  url: z.url({ protocol: /^https?$/ }).optional(),
});
export type Punto = z.infer<typeof PuntoSchema>;

export const PuntosSchema = z.object({ puntos: z.array(PuntoSchema) });
export type Puntos = z.infer<typeof PuntosSchema>;

export async function fetchPuntos(): Promise<Punto[]> {
  try {
    const res = await fetch("/data/bermejo-puntos.json");
    if (!res.ok) return [];
    return PuntosSchema.parse(await res.json()).puntos;
  } catch {
    return [];
  }
}

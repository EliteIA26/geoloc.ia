import { z } from "zod";

export const ConfianzaSchema = z.enum([
  "oficial",
  "observado",
  "estimado",
  "declarado",
]);
export type Confianza = z.infer<typeof ConfianzaSchema>;

export const IndicadorSchema = z.object({
  etiqueta: z.string(),
  valor: z.string(),
  fonte: z.string(),
  fecha: z.string(),
  confianza: ConfianzaSchema,
  nota: z.string().optional(),
});
export type Indicador = z.infer<typeof IndicadorSchema>;

export const TerritorialSchema = z.object({
  depto: z.string(),
  resumen: z.string().optional(),
  contexto: z.array(IndicadorSchema),
  satelite: z.array(IndicadorSchema),
  chile: z.array(IndicadorSchema),
});
export type Territorial = z.infer<typeof TerritorialSchema>;

export const VinchinaSatelitalSchema = z.object({
  fecha: z.string(),
  haActivaMin: z.number(),
  haActivaMax: z.number(),
  ndviMedio: z.number().optional(),
  ndmiMedio: z.number().optional(),
});
export type VinchinaSatelital = z.infer<typeof VinchinaSatelitalSchema>;

export function areaBand(
  haCentral: number,
  relMargin = 0.1,
): { min: number; max: number } {
  return {
    min: haCentral * (1 - relMargin),
    max: haCentral * (1 + relMargin),
  };
}

const areaFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

export function formatAreaRange(min: number, max: number): string {
  return `${areaFormatter.format(Math.round(min))}–${areaFormatter.format(Math.round(max))} ha`;
}

export async function fetchTerritorial(): Promise<Territorial | null> {
  try {
    const response = await fetch("/data/territorial-vinchina.json");
    if (!response.ok) return null;
    return TerritorialSchema.parse(await response.json());
  } catch {
    return null;
  }
}

export async function fetchVinchinaSatelital(): Promise<VinchinaSatelital | null> {
  try {
    const response = await fetch("/data/vinchina-satelital.json");
    if (!response.ok) return null;
    return VinchinaSatelitalSchema.parse(await response.json());
  } catch {
    return null;
  }
}

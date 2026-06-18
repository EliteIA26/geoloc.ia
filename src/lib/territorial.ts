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
  url: z.url({ protocol: /^https?$/ }).optional(),
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

const NonnegativeFiniteNumberSchema = z.number().finite().nonnegative();
const VegetationIndexSchema = z.number().finite().min(-1).max(1);

export const VinchinaSatelitalSchema = z
  .object({
    fecha: z.string(),
    haActivaMin: NonnegativeFiniteNumberSchema,
    haActivaMax: NonnegativeFiniteNumberSchema,
    ndviMedio: VegetationIndexSchema.optional(),
    ndmiMedio: VegetationIndexSchema.optional(),
  })
  .refine((data) => data.haActivaMin <= data.haActivaMax, {
    message: "haActivaMin must not exceed haActivaMax",
    path: ["haActivaMin"],
  })
  .superRefine((data, context) => {
    if (data.haActivaMax !== 0) return;
    for (const field of ["ndviMedio", "ndmiMedio"] as const) {
      if (data[field] !== undefined) {
        context.addIssue({
          code: "custom",
          message: `${field} requires observed active area`,
          path: [field],
        });
      }
    }
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

const decimalFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function composeVinchinaSatelliteIndicators(
  data: VinchinaSatelital,
): Indicador[] {
  const indicators: Indicador[] = [
    {
      etiqueta: "Área con vegetación activa observada",
      valor: formatAreaRange(data.haActivaMin, data.haActivaMax),
      fonte: "Sentinel-2 (Copernicus)",
      fecha: data.fecha,
      confianza: "estimado",
      nota:
        "Rango heurístico no validado (banda de escenario ±15%). La vegetación puede ser cultivada o natural; distinguir cultivos requiere validación local.",
    },
  ];

  if (data.ndviMedio !== undefined && data.haActivaMax > 0) {
    indicators.push({
      etiqueta: "NDVI medio (zonas activas)",
      valor: decimalFormatter.format(data.ndviMedio),
      fonte: "Sentinel-2 (Copernicus)",
      fecha: data.fecha,
      confianza: "observado",
    });
  }

  if (data.ndmiMedio !== undefined && data.haActivaMax > 0) {
    indicators.push({
      etiqueta: "NDMI medio (zonas activas)",
      valor: decimalFormatter.format(data.ndmiMedio),
      fonte: "Sentinel-2 (Copernicus)",
      fecha: data.fecha,
      confianza: "observado",
      nota:
        "Proxy de humedad de la vegetación activa; no mide directamente uso de agua ni producción.",
    });
  }

  return indicators;
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

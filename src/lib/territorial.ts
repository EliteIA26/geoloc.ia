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
const LongitudeSchema = z.number().finite().min(-180).max(180);
const LatitudeSchema = z.number().finite().min(-90).max(90);

export const VINCHINA_MONITORED_SCOPE =
  "Intersección del departamento Vinchina con la ventana monitoreada del Valle del Bermejo. No representa todo el departamento.";

export const VinchinaSatelitalSchema = z
  .object({
    fecha: z.string(),
    alcance: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.includes("ventana monitoreada") &&
          value.includes("No representa todo el departamento"),
        { message: "alcance must disclose the monitored window limitation" },
      ),
    bbox: z.tuple([
      LongitudeSchema,
      LatitudeSchema,
      LongitudeSchema,
      LatitudeSchema,
    ]),
    sceneId: z.string().refine((value) => value.trim().length > 0, {
      message: "sceneId must not be blank",
    }),
    coberturaValidaPct: z.number().finite().min(0).max(100),
    sceneUrl: z.url({ protocol: /^https?$/ }),
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
    const [west, south, east, north] = data.bbox;
    if (west >= east) {
      context.addIssue({
        code: "custom",
        message: "bbox west must be less than east",
        path: ["bbox"],
      });
    }
    if (south >= north) {
      context.addIssue({
        code: "custom",
        message: "bbox south must be less than north",
        path: ["bbox"],
      });
    }

    const itemPathSegment = new URL(data.sceneUrl).pathname.split("/").at(-1);
    let decodedItemPathSegment: string | undefined;
    try {
      decodedItemPathSegment =
        itemPathSegment === undefined
          ? undefined
          : decodeURIComponent(itemPathSegment);
    } catch {
      decodedItemPathSegment = undefined;
    }
    if (
      decodedItemPathSegment === undefined ||
      decodedItemPathSegment !== data.sceneId
    ) {
      context.addIssue({
        code: "custom",
        message: "sceneUrl must identify the exact sceneId",
        path: ["sceneUrl"],
      });
    }

    if (data.haActivaMax === 0) {
      for (const field of ["ndviMedio", "ndmiMedio"] as const) {
        if (data[field] === undefined) continue;
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

const coverageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

export function composeVinchinaSatelliteIndicators(
  data: VinchinaSatelital,
): Indicador[] {
  const indicators: Indicador[] = [
    {
      etiqueta: "Área con vegetación activa observada · valle monitoreado",
      valor: formatAreaRange(data.haActivaMin, data.haActivaMax),
      fonte: "Sentinel-2 (Copernicus)",
      fecha: data.fecha,
      confianza: "estimado",
      nota: `${data.alcance} Cobertura válida de la escena: ${coverageFormatter.format(data.coberturaValidaPct)}%. Rango heurístico no validado (banda de escenario ±15%). La vegetación puede ser cultivada o natural; distinguir cultivos requiere validación local.`,
      url: data.sceneUrl,
    },
  ];

  if (data.ndviMedio !== undefined && data.haActivaMax > 0) {
    indicators.push({
      etiqueta: "NDVI medio (zonas activas)",
      valor: decimalFormatter.format(data.ndviMedio),
      fonte: "Sentinel-2 (Copernicus)",
      fecha: data.fecha,
      confianza: "observado",
      url: data.sceneUrl,
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
      url: data.sceneUrl,
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

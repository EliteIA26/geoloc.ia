import { z } from "zod";

export const SatelitalSchema = z.object({
  ndmiAimogasta: z.number().optional(),
  ndviTrend: z
    .object({ actual: z.number(), anterior: z.number(), fechaAnterior: z.string() })
    .optional(),
  nieve: z
    .object({ cobertura: z.number(), fecha: z.string(), region: z.string() })
    .optional(),
});
export type Satelital = z.infer<typeof SatelitalSchema>;

export function ndviTrend(
  actual: number,
  anterior: number,
): { delta: number; pct: number; label: "mejoró" | "empeoró" | "estable" } {
  const delta = actual - anterior;
  const pct = anterior !== 0 ? Math.round((delta / anterior) * 100) : 0;
  const label = pct > 3 ? "mejoró" : pct < -3 ? "empeoró" : "estable";
  return { delta: Math.round(delta * 100) / 100, pct, label };
}

export function snowCoverStatus(pct: number): { valor: string; nivel: "ok" | "atencion" | "alerta" } {
  const nivel = pct < 5 ? "alerta" : pct < 20 ? "atencion" : "ok";
  // Show one decimal for tiny-but-nonzero cover so a real 0.2% reading doesn't
  // render as a misleading "0%".
  const valor = pct > 0 && pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
  return { valor, nivel };
}

// Client loader; returns null if the file is absent/invalid so the UI degrades.
export async function fetchSatelital(): Promise<Satelital | null> {
  try {
    const res = await fetch("/data/satelital.json");
    if (!res.ok) return null;
    return SatelitalSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export const ProvinciaNdviSchema = z.object({
  fecha: z.string(),
  deptos: z.record(z.string(), z.number()),
});
export type ProvinciaNdvi = z.infer<typeof ProvinciaNdviSchema>;

export async function fetchProvinciaNdvi(): Promise<ProvinciaNdvi | null> {
  try {
    const res = await fetch("/data/provincia-ndvi.json");
    if (!res.ok) return null;
    return ProvinciaNdviSchema.parse(await res.json());
  } catch {
    return null;
  }
}

// Vegetation health status derived from NDVI. Thresholds mirror the color ramp
// in colors.ts so the legend, cards and detail panel all agree:
//   < 0.4 -> baja (estrés), 0.4–0.6 -> moderada, >= 0.6 -> saludable.
export type VegetationStatus = "saludable" | "moderada" | "baja";

export function vegetationStatus(ndvi: number): VegetationStatus {
  if (ndvi >= 0.6) return "saludable";
  if (ndvi >= 0.4) return "moderada";
  return "baja";
}

// Human-friendly Spanish labels for chips/UI.
export const vegetationLabel: Record<VegetationStatus, string> = {
  saludable: "Saludable",
  moderada: "Moderada",
  baja: "Baja / Estrés",
};

// Tailwind chip classes per status (kept here so cards and detail panel match).
export const vegetationChipClass: Record<VegetationStatus, string> = {
  saludable: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  moderada: "bg-amber-100 text-amber-800 ring-amber-200",
  baja: "bg-red-100 text-red-800 ring-red-200",
};

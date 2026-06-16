// Client-side type for the /api/pronostico response. Mirrors the shape returned
// by src/app/api/pronostico/route.ts (DiaForecast / Riesgo / Senal). Kept in one
// place so producer-view and forecast-panel share an identical contract.
import type { DiaForecast } from "@/lib/open-meteo";
import type { Riesgo, Senal } from "@/lib/agroclimate";

export type Pronostico = {
  dias: DiaForecast[];
  riesgos: Riesgo[];
  senales: Senal[];
  ventana: string[];
  recomendacion: string;
  fuenteIA: boolean;
  actualizado: string;
};

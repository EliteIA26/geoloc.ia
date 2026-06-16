import { z } from "zod";

export type DiaForecast = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number };
export type Forecast = { dias: DiaForecast[] };

const DailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    et0_fao_evapotranspiration: z.array(z.number()),
  }),
});

export function parseForecast(raw: unknown): Forecast {
  const d = DailySchema.parse(raw).daily;
  const dias: DiaForecast[] = d.time.map((fecha, i) => ({
    fecha,
    tmin: d.temperature_2m_min[i],
    tmax: d.temperature_2m_max[i],
    lluvia: d.precipitation_sum[i],
    et0: d.et0_fao_evapotranspiration[i],
  }));
  return { dias };
}

// Live fetch, cached ~3h via Next's fetch revalidate. No API key required.
export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
    `&forecast_days=7&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 10800 } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json());
}

import { z } from "zod";

export type DiaForecast = {
  fecha: string;
  tmin: number;
  tmax: number;
  lluvia: number;
  et0: number;
  vientoMax: number;
  humedadMin: number;
};
export type Forecast = { dias: DiaForecast[]; sueloFrac: number; lluviaPrev30: number };

const Schema = z.object({
  daily: z
    .object({
      time: z.array(z.string()),
      temperature_2m_max: z.array(z.number()),
      temperature_2m_min: z.array(z.number()),
      precipitation_sum: z.array(z.number()),
      et0_fao_evapotranspiration: z.array(z.number()),
      wind_speed_10m_max: z.array(z.number()),
    })
    .refine(
      (d) =>
        [
          d.temperature_2m_max,
          d.temperature_2m_min,
          d.precipitation_sum,
          d.et0_fao_evapotranspiration,
          d.wind_speed_10m_max,
        ].every((a) => a.length === d.time.length),
      { message: "Open-Meteo daily arrays have mismatched lengths" },
    ),
  hourly: z.object({
    time: z.array(z.string()),
    // Open-Meteo returns null for hours beyond a variable's model horizon
    // (soil moisture especially) — tolerate nulls and skip them in aggregation.
    relative_humidity_2m: z.array(z.number().nullable()),
    soil_moisture_3_to_9cm: z.array(z.number().nullable()),
  }),
});

export function dailyMinHumidity(hourTimes: string[], hum: (number | null)[], fechas: string[]): number[] {
  return fechas.map((f) => {
    const vals: number[] = [];
    hourTimes.forEach((t, i) => {
      const v = hum[i];
      if (t.startsWith(f) && typeof v === "number") vals.push(v);
    });
    return vals.length ? Math.min(...vals) : 50;
  });
}

export function parseForecast(raw: unknown, forecastDays = 7): Forecast {
  const p = Schema.parse(raw);
  const d = p.daily;
  const n = d.time.length;
  const start = Math.max(0, n - forecastDays);
  const fechasFut = d.time.slice(start);
  const humMin = dailyMinHumidity(p.hourly.time, p.hourly.relative_humidity_2m, fechasFut);
  const dias: DiaForecast[] = fechasFut.map((fecha, k) => {
    const i = start + k;
    return {
      fecha,
      tmin: d.temperature_2m_min[i],
      tmax: d.temperature_2m_max[i],
      lluvia: d.precipitation_sum[i],
      et0: d.et0_fao_evapotranspiration[i],
      vientoMax: d.wind_speed_10m_max[i],
      humedadMin: humMin[k],
    };
  });
  const lluviaPrev30 = d.precipitation_sum.slice(0, start).reduce((a, b) => a + b, 0);
  const soil = p.hourly.soil_moisture_3_to_9cm.filter((v): v is number => typeof v === "number");
  const sueloFrac = soil.length ? soil.reduce((a, b) => a + b, 0) / soil.length : 0.2;
  return { dias, sueloFrac, lluviaPrev30 };
}

// Live fetch, cached ~3h via Next's fetch revalidate. No API key required.
export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max` +
    `&hourly=relative_humidity_2m,soil_moisture_3_to_9cm` +
    `&past_days=30&forecast_days=7&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 10800 } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json(), 7);
}

import { describe, it, expect } from "vitest";
import { dailyMinHumidity, parseForecast } from "./open-meteo";

const sample = {
  daily: {
    time: ["2026-06-16", "2026-06-17"],
    temperature_2m_max: [22.4, 24.1],
    temperature_2m_min: [3.2, -1.0],
    precipitation_sum: [0, 1.5],
    et0_fao_evapotranspiration: [4.1, 4.4],
    wind_speed_10m_max: [12, 14],
    wind_gusts_10m_max: [20, 22],
  },
  hourly: {
    time: ["2026-06-16T06:00", "2026-06-17T06:00"],
    relative_humidity_2m: [45, 50],
    soil_moisture_3_to_9cm: [0.18, 0.2],
  },
};

describe("parseForecast", () => {
  it("maps the daily arrays into per-day objects", () => {
    const f = parseForecast(sample, 2);
    expect(f.dias).toHaveLength(2);
    expect(f.dias[1]).toEqual({
      fecha: "2026-06-17",
      tmin: -1.0,
      tmax: 24.1,
      lluvia: 1.5,
      et0: 4.4,
      vientoMax: 14,
      humedadMin: 50,
    });
  });
  it("throws on a malformed payload", () => {
    expect(() => parseForecast({ daily: { time: ["x"] } })).toThrow();
  });
  it("throws when daily arrays have mismatched lengths", () => {
    expect(() =>
      parseForecast({
        daily: {
          time: ["2026-06-16", "2026-06-17"],
          temperature_2m_max: [22.4], // shorter than time
          temperature_2m_min: [3.2, -1.0],
          precipitation_sum: [0, 1.5],
          et0_fao_evapotranspiration: [4.1, 4.4],
          wind_speed_10m_max: [12, 14],
          wind_gusts_10m_max: [20, 22],
        },
        hourly: sample.hourly,
      }),
    ).toThrow();
  });
});

describe("dailyMinHumidity", () => {
  it("reduces hourly humidity to the per-day minimum", () => {
    const times = ["2026-06-16T00:00", "2026-06-16T12:00", "2026-06-17T00:00"];
    const vals = [40, 22, 55];
    expect(dailyMinHumidity(times, vals, ["2026-06-16", "2026-06-17"])).toEqual([22, 55]);
  });
});

describe("parseForecast (rich)", () => {
  const raw = {
    daily: {
      time: ["2026-06-15", "2026-06-16", "2026-06-17"],
      temperature_2m_max: [20, 22, 24],
      temperature_2m_min: [5, 6, -1],
      precipitation_sum: [3, 0, 0],
      et0_fao_evapotranspiration: [2, 4, 5],
      wind_speed_10m_max: [10, 30, 15],
      wind_gusts_10m_max: [18, 50, 22],
    },
    hourly: {
      time: ["2026-06-16T06:00", "2026-06-16T15:00", "2026-06-17T06:00"],
      relative_humidity_2m: [60, 20, 70],
      soil_moisture_3_to_9cm: [0.18, 0.18, 0.2],
    },
  };
  it("takes the LAST 2 daily entries as the forecast and sums past rain", () => {
    const f = parseForecast(raw, 2);
    expect(f.dias).toHaveLength(2);
    expect(f.dias[0]).toMatchObject({ fecha: "2026-06-16", tmin: 6, tmax: 22, vientoMax: 30, humedadMin: 20 });
    expect(f.lluviaPrev30).toBe(3); // the one past day before the last 2
    expect(f.sueloFrac).toBeCloseTo(0.187, 2);
  });
  it("tolerates null soil moisture / humidity (Open-Meteo nulls past the model horizon)", () => {
    const rawNull = {
      daily: raw.daily,
      hourly: {
        time: ["2026-06-16T06:00", "2026-06-16T15:00", "2026-06-17T06:00"],
        relative_humidity_2m: [60, null, 70],
        soil_moisture_3_to_9cm: [0.2, null, null],
      },
    };
    const f = parseForecast(rawNull, 2);
    expect(f.sueloFrac).toBeCloseTo(0.2, 2); // only the non-null value
    expect(f.dias[0].humedadMin).toBe(60); // null hour skipped on 2026-06-16
  });
});

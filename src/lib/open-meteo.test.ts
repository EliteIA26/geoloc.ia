import { describe, it, expect } from "vitest";
import { parseForecast } from "./open-meteo";

const sample = {
  daily: {
    time: ["2026-06-16", "2026-06-17"],
    temperature_2m_max: [22.4, 24.1],
    temperature_2m_min: [3.2, -1.0],
    precipitation_sum: [0, 1.5],
    et0_fao_evapotranspiration: [4.1, 4.4],
  },
};

describe("parseForecast", () => {
  it("maps the daily arrays into per-day objects", () => {
    const f = parseForecast(sample);
    expect(f.dias).toHaveLength(2);
    expect(f.dias[1]).toEqual({ fecha: "2026-06-17", tmin: -1.0, tmax: 24.1, lluvia: 1.5, et0: 4.4 });
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
        },
      }),
    ).toThrow();
  });
});

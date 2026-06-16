import { describe, it, expect } from "vitest";
import { buildNarrativePrompt } from "./ai-narrative";
import type { Forecast } from "./open-meteo";
import type { Riesgo } from "./agroclimate";

const forecast: Forecast = {
  dias: [
    { fecha: "2026-06-16", tmin: 3, tmax: 22, lluvia: 0, et0: 4 },
    { fecha: "2026-06-17", tmin: -1, tmax: 24, lluvia: 0, et0: 5 },
  ],
};
const riesgos: Riesgo[] = [
  { tipo: "helada", nivel: "medio", dia: "2026-06-17", detalle: "Mínima -1°C" },
];

describe("buildNarrativePrompt", () => {
  it("embeds the real numbers and risks so the model is grounded", () => {
    const p = buildNarrativePrompt(forecast, riesgos, "olivo");
    expect(p).toContain("2026-06-17");
    expect(p).toContain("-1");
    expect(p).toContain("helada");
    expect(p).toMatch(/olivo/i);
  });
  it("instructs to use ONLY the given data (no invention)", () => {
    expect(buildNarrativePrompt(forecast, [], "olivo")).toMatch(/solo|únicamente|no inventes/i);
  });
});

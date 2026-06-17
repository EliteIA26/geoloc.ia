import { describe, it, expect } from "vitest";
import { buildNarrativePrompt, buildTerritorialPrompt, stripMarkdown } from "./ai-narrative";
import type { Forecast } from "./open-meteo";
import type { Riesgo } from "./agroclimate";

const forecast: Forecast = {
  dias: [
    { fecha: "2026-06-16", tmin: 3, tmax: 22, lluvia: 0, et0: 4, vientoMax: 12, humedadMin: 40 },
    { fecha: "2026-06-17", tmin: -1, tmax: 24, lluvia: 0, et0: 5, vientoMax: 14, humedadMin: 35 },
  ],
  sueloFrac: 0.2,
  lluviaPrev30: 10,
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

describe("buildTerritorialPrompt", () => {
  it("embeds per-department risk summary and instructs grounding", () => {
    const p = buildTerritorialPrompt([
      { nombre: "Arauco", riesgos: ["incendio"] },
      { nombre: "Famatina", riesgos: ["helada"] },
    ]);
    expect(p).toContain("Arauco");
    expect(p).toContain("Famatina");
    expect(p).toMatch(/solo|únicamente|no inventes/i);
  });
});

describe("stripMarkdown", () => {
  it("removes bold/italic asterisks and headings", () => {
    expect(stripMarkdown("**Recomendación:** regá *hoy*")).toBe("Recomendación: regá hoy");
    expect(stripMarkdown("# Título\n- item")).toBe("Título item");
  });
  it("collapses whitespace and trims", () => {
    expect(stripMarkdown("a  \n\n  b")).toBe("a b");
  });
});

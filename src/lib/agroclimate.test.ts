import { describe, it, expect } from "vitest";
import { frostRisk, heatRisk, waterDeficitRisk, ruleBasedRecommendation } from "./agroclimate";

const fechas = ["2026-06-16", "2026-06-17", "2026-06-18"];

describe("frostRisk (olivo)", () => {
  it("returns null when no cold day", () => {
    expect(frostRisk([8, 6, 10], fechas, "olivo")).toBeNull();
  });
  it("medio when a min hits 0 or below (>-3)", () => {
    const r = frostRisk([8, -1, 5], fechas, "olivo");
    expect(r?.tipo).toBe("helada");
    expect(r?.nivel).toBe("medio");
    expect(r?.dia).toBe("2026-06-17");
  });
  it("alto when a min is <= -3", () => {
    expect(frostRisk([2, -4, 1], fechas, "olivo")?.nivel).toBe("alto");
  });
});

describe("heatRisk (olivo)", () => {
  it("null below threshold", () => {
    expect(heatRisk([30, 33, 31], fechas, "olivo")).toBeNull();
  });
  it("medio at >=38, alto at >=42", () => {
    expect(heatRisk([38, 35, 30], fechas, "olivo")?.nivel).toBe("medio");
    expect(heatRisk([30, 43, 30], fechas, "olivo")?.nivel).toBe("alto");
  });
});

describe("waterDeficitRisk", () => {
  it("null when balance is low", () => {
    expect(waterDeficitRisk([3, 3, 3], [5, 5, 5], 0.6)).toBeNull();
  });
  it("medio for moderate accumulated deficit", () => {
    expect(waterDeficitRisk([10, 10, 10], [2, 2, 1], 0.6)?.nivel).toBe("medio");
  });
  it("escalates a level when ndvi is already low (stressed)", () => {
    expect(waterDeficitRisk([10, 10, 10], [2, 2, 1], 0.3)?.nivel).toBe("alto");
  });
});

describe("ruleBasedRecommendation", () => {
  it("reassures when no risks", () => {
    expect(ruleBasedRecommendation([])).toMatch(/sin alertas|adecuad/i);
  });
  it("mentions riego when water deficit present", () => {
    const rec = ruleBasedRecommendation([
      { tipo: "deficit_hidrico", nivel: "alto", dia: "esta semana", detalle: "x" },
    ]);
    expect(rec).toMatch(/rieg/i);
  });
});

import { describe, it, expect } from "vitest";
import { classifyWaterStress, irrigationHint } from "./water-stress";

describe("classifyWaterStress", () => {
  it("rojo when index is low", () => { expect(classifyWaterStress(0.15)).toBe("rojo"); });
  it("ambar when index is moderate", () => { expect(classifyWaterStress(0.45)).toBe("ambar"); });
  it("verde when index is high", () => { expect(classifyWaterStress(0.75)).toBe("verde"); });
});

describe("irrigationHint", () => {
  it("urges irrigation when rojo", () => { expect(irrigationHint(0.15)).toMatch(/riego/i); });
  it("is reassuring when verde", () => { expect(irrigationHint(0.75)).toMatch(/adecuad/i); });
});

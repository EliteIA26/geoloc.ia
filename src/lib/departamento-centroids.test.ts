import { describe, it, expect } from "vitest";
import { CENTROIDES } from "./departamento-centroids";

describe("CENTROIDES", () => {
  it("has 18 La Rioja departments with plausible coords", () => {
    expect(CENTROIDES).toHaveLength(18);
    for (const c of CENTROIDES) {
      expect(c.lon).toBeGreaterThan(-70);
      expect(c.lon).toBeLessThan(-65);
      expect(c.lat).toBeGreaterThan(-32);
      expect(c.lat).toBeLessThan(-27);
    }
    expect(CENTROIDES.some((c) => c.nombre === "Arauco")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { buildSparklinePath } from "./sparkline";

describe("buildSparklinePath", () => {
  it("maps a flat series to a horizontal line at the bottom", () => {
    expect(buildSparklinePath([0.5, 0.5], 100, 20)).toBe("M 0 20 L 100 20");
  });
  it("maps min to bottom and max to top", () => {
    expect(buildSparklinePath([0, 1], 100, 20)).toBe("M 0 20 L 100 0");
  });
  it("returns empty string for fewer than 2 points", () => {
    expect(buildSparklinePath([0.5], 100, 20)).toBe("");
  });
});

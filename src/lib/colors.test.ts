import { describe, it, expect } from "vitest";
import { ndviToColor } from "./colors";

describe("ndviToColor", () => {
  it("returns a red-ish hex for low NDVI (stressed)", () => {
    expect(ndviToColor(0.1)).toBe("#d73027");
  });
  it("returns a mid hex for moderate NDVI", () => {
    expect(ndviToColor(0.45)).toBe("#fee08b");
  });
  it("returns a green hex for high NDVI (healthy)", () => {
    expect(ndviToColor(0.8)).toBe("#1a9850");
  });
  it("clamps out-of-range values", () => {
    expect(ndviToColor(-5)).toBe("#d73027");
    expect(ndviToColor(5)).toBe("#1a9850");
  });
});

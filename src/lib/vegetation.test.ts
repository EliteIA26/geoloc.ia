import { describe, it, expect } from "vitest";
import { vegetationStatus, vegetationLabel } from "./vegetation";

describe("vegetationStatus", () => {
  it("baja when NDVI is below 0.4", () => {
    expect(vegetationStatus(0.0)).toBe("baja");
    expect(vegetationStatus(0.39)).toBe("baja");
  });
  it("moderada when NDVI is in [0.4, 0.6)", () => {
    expect(vegetationStatus(0.4)).toBe("moderada");
    expect(vegetationStatus(0.55)).toBe("moderada");
    expect(vegetationStatus(0.599)).toBe("moderada");
  });
  it("saludable when NDVI is 0.6 or above", () => {
    expect(vegetationStatus(0.6)).toBe("saludable");
    expect(vegetationStatus(0.85)).toBe("saludable");
  });
});

describe("vegetationLabel", () => {
  it("has a human label for every status", () => {
    expect(vegetationLabel.saludable).toMatch(/saludable/i);
    expect(vegetationLabel.moderada).toMatch(/moderada/i);
    expect(vegetationLabel.baja).toMatch(/estr|baja/i);
  });
});

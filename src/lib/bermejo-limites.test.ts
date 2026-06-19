import { describe, it, expect } from "vitest";
import { LimitesSchema } from "./bermejo-limites";
describe("LimitesSchema", () => {
  it("parses a protected-area FeatureCollection", () => {
    const v = LimitesSchema.parse({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { id: "talampaya", nombre: "PN Talampaya", fonte: "APN" },
        geometry: { type: "Polygon", coordinates: [[[ -67.9,-29.8],[-67.8,-29.8],[-67.8,-29.7],[-67.9,-29.8]]] } }],
    });
    expect(v.features[0].properties.id).toBe("talampaya");
  });
});

import { describe, it, expect } from "vitest";
import { ndviTrend, snowCoverStatus, SatelitalSchema, ProvinciaNdviSchema } from "./satelital";

describe("ndviTrend", () => {
  it("mejoró when current is clearly higher", () => {
    const t = ndviTrend(0.5, 0.46);
    expect(t.label).toBe("mejoró");
    expect(t.pct).toBe(9);
  });
  it("empeoró when current is clearly lower", () => {
    expect(ndviTrend(0.46, 0.5).label).toBe("empeoró");
  });
  it("estable within ±3%", () => {
    expect(ndviTrend(0.5, 0.49).label).toBe("estable");
  });
});

describe("snowCoverStatus", () => {
  it("alerta when snow cover is very low", () => {
    expect(snowCoverStatus(2).nivel).toBe("alerta");
  });
  it("atencion mid", () => {
    expect(snowCoverStatus(12).nivel).toBe("atencion");
  });
  it("ok when ample", () => {
    expect(snowCoverStatus(40).nivel).toBe("ok");
    expect(snowCoverStatus(40).valor).toBe("40%");
  });
  it("shows one decimal for a tiny non-zero reading (not '0%')", () => {
    expect(snowCoverStatus(0.2).valor).toBe("0.2%");
    expect(snowCoverStatus(0).valor).toBe("0%");
  });
});

describe("SatelitalSchema", () => {
  it("accepts a partial payload (all keys optional)", () => {
    expect(() => SatelitalSchema.parse({ nieve: { cobertura: 10, fecha: "2026-06-10", region: "x" } })).not.toThrow();
    expect(() => SatelitalSchema.parse({})).not.toThrow();
  });
});

describe("ProvinciaNdviSchema", () => {
  it("parses fecha + per-department means", () => {
    const v = ProvinciaNdviSchema.parse({ fecha: "2026-06-17", deptos: { Arauco: 0.42, Capital: 0.31 } });
    expect(v.deptos.Arauco).toBe(0.42);
  });
});

import { AimogastaSerieSchema } from "./satelital";

describe("AimogastaSerieSchema", () => {
  it("parses the scene list", () => {
    const v = AimogastaSerieSchema.parse({
      escenas: [{ fecha: "2026-05-24", nubes: 6.7, png: "aimogasta-ndvi-2026-05-24.png", coordinates: [[-66.8,-27.7],[-66.7,-27.7],[-66.7,-27.9],[-66.8,-27.9]] }],
    });
    expect(v.escenas[0].fecha).toBe("2026-05-24");
  });
});
describe("ProvinciaNdviSchema deptosNdwi", () => {
  it("accepts optional deptosNdwi", () => {
    expect(() => ProvinciaNdviSchema.parse({ fecha: "2026-05-25", deptos: { Arauco: 0.4 }, deptosNdwi: { Arauco: 0.1 } })).not.toThrow();
    expect(() => ProvinciaNdviSchema.parse({ fecha: "2026-05-25", deptos: { Arauco: 0.4 } })).not.toThrow();
  });
});

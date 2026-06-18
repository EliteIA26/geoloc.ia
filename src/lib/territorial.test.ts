import { describe, expect, it } from "vitest";
import {
  TerritorialSchema,
  VinchinaSatelitalSchema,
  areaBand,
  formatAreaRange,
} from "./territorial";

describe("TerritorialSchema", () => {
  it("parses territorial indicators and confidence levels", () => {
    const territorial = TerritorialSchema.parse({
      depto: "Vinchina",
      contexto: [
        {
          etiqueta: "Población 2022",
          valor: "2.500",
          fonte: "INDEC Censo 2022",
          fecha: "2022",
          confianza: "oficial",
        },
      ],
      satelite: [],
      chile: [
        {
          etiqueta: "Paso Pircas Negras",
          valor: "incipiente",
          fonte: "POT 2015",
          fecha: "2015",
          confianza: "oficial",
          nota: "RN76",
        },
      ],
    });

    expect(territorial.depto).toBe("Vinchina");
    expect(territorial.contexto[0].confianza).toBe("oficial");
  });

  it("rejects unknown confidence levels", () => {
    expect(() =>
      TerritorialSchema.parse({
        depto: "Vinchina",
        contexto: [
          {
            etiqueta: "Población 2022",
            valor: "2.500",
            fonte: "INDEC Censo 2022",
            fecha: "2022",
            confianza: "magico",
          },
        ],
        satelite: [],
        chile: [],
      }),
    ).toThrow();
  });
});

describe("VinchinaSatelitalSchema", () => {
  it("parses the active-area range and optional indices", () => {
    const satelital = VinchinaSatelitalSchema.parse({
      fecha: "2026-05-24",
      haActivaMin: 1240,
      haActivaMax: 1360,
      ndviMedio: 0.32,
    });

    expect(satelital.haActivaMax).toBe(1360);
  });
});

describe("areaBand", () => {
  it("uses a 10% margin by default", () => {
    expect(areaBand(1000)).toEqual({ min: 900, max: 1100 });
  });

  it("accepts a custom relative margin", () => {
    expect(areaBand(1000, 0.2)).toEqual({ min: 800, max: 1200 });
  });
});

describe("formatAreaRange", () => {
  it("rounds and formats hectares using the es-AR locale", () => {
    expect(formatAreaRange(1240.4, 1359.6)).toBe("1.240–1.360 ha");
  });
});

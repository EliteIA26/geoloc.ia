import { describe, expect, it } from "vitest";
import {
  IndicadorSchema,
  TerritorialSchema,
  VinchinaSatelitalSchema,
  areaBand,
  composeVinchinaSatelliteIndicators,
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

  it.each([
    { haActivaMin: -1, haActivaMax: 10 },
    { haActivaMin: 10, haActivaMax: -1 },
    { haActivaMin: 11, haActivaMax: 10 },
    { haActivaMin: 0, haActivaMax: Number.POSITIVE_INFINITY },
  ])("rejects invalid active-area ranges: %o", (range) => {
    expect(
      VinchinaSatelitalSchema.safeParse({
        fecha: "2026-05-24",
        ...range,
      }).success,
    ).toBe(false);
  });

  it.each([
    { ndviMedio: -1.01 },
    { ndviMedio: 1.01 },
    { ndmiMedio: -1.01 },
    { ndmiMedio: 1.01 },
  ])("rejects out-of-range vegetation indices: %o", (index) => {
    expect(
      VinchinaSatelitalSchema.safeParse({
        fecha: "2026-05-24",
        haActivaMin: 10,
        haActivaMax: 20,
        ...index,
      }).success,
    ).toBe(false);
  });

  it("rejects an active-zone mean when active area is zero", () => {
    expect(
      VinchinaSatelitalSchema.safeParse({
        fecha: "2026-05-24",
        haActivaMin: 0,
        haActivaMax: 0,
        ndviMedio: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects active-zone NDMI when active area is zero", () => {
    expect(
      VinchinaSatelitalSchema.safeParse({
        fecha: "2026-05-24",
        haActivaMin: 0,
        haActivaMax: 0,
        ndmiMedio: 0,
      }).success,
    ).toBe(false);
  });
});

describe("IndicadorSchema source URL", () => {
  const indicator = {
    etiqueta: "Población 2022",
    valor: "2.500",
    fonte: "INDEC Censo 2022",
    fecha: "2022",
    confianza: "oficial" as const,
  };

  it.each([
    "https://www.indec.gob.ar/indec/web/Nivel4-Tema-2-41-165",
    "http://datos.example.org/indicador?id=2022",
  ])("preserves an absolute HTTP source URL: %s", (url) => {
    expect(IndicadorSchema.parse({ ...indicator, url }).url).toBe(url);
  });

  it.each([
    "not-a-url",
    "/fuentes/indec",
    "ftp://datos.example.org/indicador.csv",
    "mailto:fuentes@example.org",
  ])("rejects an invalid or non-HTTP source URL: %s", (url) => {
    expect(IndicadorSchema.safeParse({ ...indicator, url }).success).toBe(false);
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

describe("composeVinchinaSatelliteIndicators", () => {
  it("composes the active-area range and observed NDVI/NDMI indicators", () => {
    expect(
      composeVinchinaSatelliteIndicators({
        fecha: "2026-05-24",
        haActivaMin: 1240,
        haActivaMax: 1360,
        ndviMedio: 0.324,
        ndmiMedio: 0.187,
      }),
    ).toEqual([
      {
        etiqueta: "Área con vegetación activa observada",
        valor: "1.240–1.360 ha",
        fonte: "Sentinel-2 (Copernicus)",
        fecha: "2026-05-24",
        confianza: "estimado",
        nota: "Rango heurístico no validado (banda de escenario ±15%). La vegetación puede ser cultivada o natural; distinguir cultivos requiere validación local.",
      },
      {
        etiqueta: "NDVI medio (zonas activas)",
        valor: "0,32",
        fonte: "Sentinel-2 (Copernicus)",
        fecha: "2026-05-24",
        confianza: "observado",
      },
      {
        etiqueta: "NDMI medio (zonas activas)",
        valor: "0,19",
        fonte: "Sentinel-2 (Copernicus)",
        fecha: "2026-05-24",
        confianza: "observado",
        nota: "Proxy de humedad de la vegetación activa; no mide directamente uso de agua ni producción.",
      },
    ]);
  });

  it("omits the NDVI indicator when the mean is unavailable", () => {
    const indicators = composeVinchinaSatelliteIndicators({
      fecha: "2026-05-24",
      haActivaMin: 1240,
      haActivaMax: 1360,
    });

    expect(indicators).toHaveLength(1);
    expect(indicators[0].etiqueta).toBe(
      "Área con vegetación activa observada",
    );
  });

  it("omits the NDMI indicator when the mean is unavailable", () => {
    const indicators = composeVinchinaSatelliteIndicators({
      fecha: "2026-05-24",
      haActivaMin: 1240,
      haActivaMax: 1360,
      ndviMedio: 0.324,
    });

    expect(indicators.map((indicator) => indicator.etiqueta)).not.toContain(
      "NDMI medio (zonas activas)",
    );
  });

  it("does not describe an active-zone mean when active area is zero", () => {
    const indicators = composeVinchinaSatelliteIndicators({
      fecha: "2026-05-24",
      haActivaMin: 0,
      haActivaMax: 0,
      ndviMedio: 0,
    });

    expect(indicators.map((indicator) => indicator.etiqueta)).not.toContain(
      "NDVI medio (zonas activas)",
    );
  });
});

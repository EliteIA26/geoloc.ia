import { describe, it, expect } from "vitest";
import { PuntosSchema } from "./bermejo-puntos";

const sample = {
  puntos: [
    {
      id: "laguna-brava",
      nombre: "Reserva Provincial Laguna Brava",
      tipo: "atractivo",
      eje: "turismo",
      coordinates: [-68.85, -28.3],
      foto: "/img/bermejo/laguna-brava.jpg",
      credito: "Autor — CC BY-SA 4.0 (Wikimedia Commons)",
      descripcion: "Sistema de lagunas de altura.",
      datos: ["flamencos y vicuñas", "Sitio Ramsar"],
      fonte: "Turismo La Rioja",
      confianza: "oficial",
    },
    {
      id: "jague",
      nombre: "Jagüé",
      tipo: "localidad",
      eje: "poblacion",
      coordinates: [-68.5, -28.55],
      foto: null,
      descripcion: "Localidad del oeste del departamento.",
      datos: [],
      fonte: "IGN",
      confianza: "oficial",
    },
  ],
};

describe("PuntosSchema", () => {
  it("parses points with photo and with null photo", () => {
    const v = PuntosSchema.parse(sample);
    expect(v.puntos).toHaveLength(2);
    expect(v.puntos[0].tipo).toBe("atractivo");
    expect(v.puntos[1].foto).toBeNull();
  });
  it("rejects an invalid tipo", () => {
    expect(() =>
      PuntosSchema.parse({ puntos: [{ ...sample.puntos[1], tipo: "ciudad" }] }),
    ).toThrow();
  });
  it("rejects an invalid eje", () => {
    expect(() =>
      PuntosSchema.parse({ puntos: [{ ...sample.puntos[1], eje: "magia" }] }),
    ).toThrow();
  });
});

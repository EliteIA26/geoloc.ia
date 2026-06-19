import { describe, it, expect } from "vitest";
import { PuntosSchema } from "./bermejo-puntos";

const sample = {
  puntos: [
    {
      id: "laguna-brava", nombre: "Reserva Provincial Laguna Brava", tipo: "atractivo",
      eje: "turismo", coordinates: [-68.85, -28.3], foto: "/img/bermejo/laguna-brava.jpg",
      credito: "Autor — CC BY-SA 4.0 (Wikimedia Commons)",
      descripcion: "Sistema de lagunas de altura.",
      hero: [{ etiqueta: "Altitud", valor: ">4.000 m" }, { etiqueta: "Estatus", valor: "Sitio Ramsar" }],
      secciones: [{ titulo: "Qué ver", items: ["flamencos", "vicuñas"], fonte: "Turismo La Rioja", confianza: "oficial" }],
      limite: { tipo: "area", ref: "laguna-brava" },
      fonte: "Turismo La Rioja", confianza: "oficial",
    },
    {
      id: "vinchina", nombre: "Vinchina", tipo: "localidad", eje: "poblacion",
      coordinates: [-68.2, -28.76], foto: null, descripcion: "Cabecera departamental.",
      hero: [{ etiqueta: "Población depto.", valor: "2.699" }],
      secciones: [], limite: { tipo: "departamento", ref: "Vinchina" },
      fonte: "INDEC", confianza: "oficial",
    },
  ],
};

describe("PuntosSchema v2", () => {
  it("parses hero/secciones/limite", () => {
    const v = PuntosSchema.parse(sample);
    expect(v.puntos[0].hero[1].valor).toBe("Sitio Ramsar");
    expect(v.puntos[0].limite.tipo).toBe("area");
    expect(v.puntos[1].secciones).toEqual([]);
  });
  it("rejects an invalid limite.tipo", () => {
    expect(() => PuntosSchema.parse({ puntos: [{ ...sample.puntos[1], limite: { tipo: "pais" } }] })).toThrow();
  });
});

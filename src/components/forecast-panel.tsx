"use client";

import { useEffect, useState } from "react";

type Dia = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number };
type Riesgo = { tipo: "helada" | "deficit_hidrico" | "calor"; nivel: "bajo" | "medio" | "alto"; dia: string; detalle: string };
type Pronostico = { dias: Dia[]; riesgos: Riesgo[]; recomendacion: string; fuenteIA: boolean; actualizado: string };

const RIESGO_LABEL: Record<Riesgo["tipo"], string> = {
  helada: "Helada",
  deficit_hidrico: "Déficit hídrico",
  calor: "Calor",
};
const NIVEL_CLASS: Record<Riesgo["nivel"], string> = {
  bajo: "bg-yellow-100 text-yellow-800",
  medio: "bg-orange-100 text-orange-800",
  alto: "bg-red-100 text-red-800",
};

function diaCorto(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short" });
}

export default function ForecastPanel({ lat, lon, ndvi, crop = "olivo" }: { lat: number; lon: number; ndvi: number; crop?: "olivo" | "vid" }) {
  const [data, setData] = useState<Pronostico | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setEstado("loading");
    fetch(`/api/pronostico?lat=${lat}&lon=${lon}&ndvi=${ndvi}&crop=${crop}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Pronostico) => { setData(j); setEstado("ok"); })
      .catch(() => setEstado("error"));
  }, [lat, lon, ndvi, crop]);

  if (estado === "loading") return <div className="rounded border p-3 text-sm text-gray-500">Cargando pronóstico…</div>;
  if (estado === "error" || !data) return <div className="rounded border p-3 text-sm text-gray-500">Pronóstico no disponible ahora.</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-emerald-900">Pronóstico 7 días</h3>
      <div className="flex gap-1 overflow-x-auto">
        {data.dias.map((d) => (
          <div key={d.fecha} className="flex min-w-12 flex-col items-center rounded bg-gray-50 px-2 py-1 text-center">
            <span className="text-[11px] font-medium capitalize text-gray-600">{diaCorto(d.fecha)}</span>
            <span className="text-xs font-semibold">{Math.round(d.tmax)}°</span>
            <span className="text-[11px] text-gray-500">{Math.round(d.tmin)}°</span>
            <span className="text-[10px] text-sky-600">{d.lluvia > 0 ? `${d.lluvia}mm` : "—"}</span>
          </div>
        ))}
      </div>
      {data.riesgos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.riesgos.map((r, i) => (
            <span key={i} className={`rounded px-2 py-0.5 text-[11px] font-medium ${NIVEL_CLASS[r.nivel]}`} title={r.detalle}>
              {RIESGO_LABEL[r.tipo]} · {r.nivel}
            </span>
          ))}
        </div>
      )}
      <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">{data.recomendacion}</p>
      <p className="text-[10px] text-gray-400">
        Clima: Open-Meteo · {data.fuenteIA ? "análisis: IA" : "recomendación automática"} · actualizado{" "}
        {new Date(data.actualizado).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
      </p>
    </div>
  );
}

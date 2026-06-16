"use client";

import type { Pronostico } from "@/lib/pronostico";

const RIESGO_LABEL: Record<Pronostico["riesgos"][number]["tipo"], string> = {
  helada: "Helada",
  deficit_hidrico: "Déficit hídrico",
  calor: "Calor",
  incendio: "Incendio",
  sequia: "Sequía",
};

// Editorial risk-badge tones (calm, flat — no heavy color blocks).
const NIVEL_CLASS: Record<Pronostico["riesgos"][number]["nivel"], string> = {
  bajo: "bg-amber-50 text-amber-800",
  medio: "bg-orange-50 text-orange-800",
  alto: "bg-red-50 text-red-800",
};

function diaCorto(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short" });
}

// "2026-06-17" -> "mar 17"; falls back to the raw string if unparseable.
function ventanaCorta(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
}

// Presentational: the fetch is lifted to ProducerView so the hero, signal grid
// and this panel share a single /api/pronostico call. Loading/error are driven
// by `estado`.
export default function ForecastPanel({
  data,
  estado,
}: {
  data: Pronostico | null;
  estado: "loading" | "ok" | "error";
}) {
  if (estado === "loading")
    return <div className="ed-card p-3 text-sm ed-faint">Cargando pronóstico…</div>;
  if (estado === "error" || !data)
    return <div className="ed-card p-3 text-sm ed-faint">Pronóstico no disponible ahora.</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm ed-soft">Pronóstico 7 días</h3>
      <div className="flex gap-1 overflow-x-auto">
        {data.dias.map((d) => (
          <div
            key={d.fecha}
            className="ed-card flex min-w-12 flex-col items-center px-2 py-1.5 text-center"
          >
            <span className="text-[11px] capitalize ed-faint">{diaCorto(d.fecha)}</span>
            <span className="text-xs text-[var(--ink)]">{Math.round(d.tmax)}°</span>
            <span className="text-[11px] ed-faint">{Math.round(d.tmin)}°</span>
            <span className="text-[10px] text-sky-600">{d.lluvia > 0 ? `${d.lluvia}mm` : "—"}</span>
          </div>
        ))}
      </div>
      {data.riesgos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.riesgos.map((r, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${NIVEL_CLASS[r.nivel]}`}
              title={r.detalle}
            >
              {RIESGO_LABEL[r.tipo] ?? r.tipo} · {r.nivel}
            </span>
          ))}
        </div>
      )}
      {data.ventana.length > 0 && (
        <p className="ed-card p-3 text-sm ed-soft">
          <span className="ed-accent">Buenos días para regar/aplicar:</span>{" "}
          <span className="capitalize">{data.ventana.map(ventanaCorta).join(" · ")}</span>
        </p>
      )}
      <p className="text-[10px] ed-faint">
        Clima: Open-Meteo · {data.fuenteIA ? "análisis: IA" : "recomendación automática"} · actualizado{" "}
        {new Date(data.actualizado).toLocaleString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "short",
        })}
      </p>
    </div>
  );
}

"use client";

import type { DepartamentoProps } from "@/lib/departamentos";
import {
  vegetationStatus,
  vegetationSentence,
  vegetationDotClass,
} from "@/lib/vegetation";
import { buildSparklinePath } from "@/lib/sparkline";

function ProvenancePill({ fuente }: { fuente: DepartamentoProps["fuente"] }) {
  const satelital = fuente === "satelital";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
        satelital ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 ed-soft"
      }`}
    >
      <span aria-hidden>{satelital ? "●" : "○"}</span>
      {satelital ? "Satelital" : "Referencia"}
    </span>
  );
}

export default function DepartmentDetail({
  dep,
  serie,
  onClear,
}: {
  dep: DepartamentoProps | null;
  serie: number[];
  onClear: () => void;
}) {
  if (!dep) {
    return (
      <div className="ed-card border-dashed p-4 text-center text-xs ed-faint">
        Hacé clic en un departamento para ver el detalle.
      </div>
    );
  }

  const status = vegetationStatus(dep.ndvi);
  const showSparkline = dep.nombre === "Arauco" && serie.length > 1;

  return (
    <div className="ed-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] ed-faint">Departamento · {dep.nombre}</p>
          {/* Insight first: the plain-language status is the protagonist. */}
          <p className="mt-1 flex items-start gap-2 text-[17px] leading-snug text-[var(--ink)]">
            <span
              className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${vegetationDotClass[status]}`}
              aria-hidden
            />
            {vegetationSentence[status]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md px-2 py-1 text-xs ed-soft hover:bg-stone-100"
        >
          Limpiar
        </button>
      </div>

      {/* Raw indices demoted to a muted secondary evidence line. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] ed-faint">
        <span>
          NDVI <span className="ed-soft tabular-nums">{dep.ndvi.toFixed(2)}</span>
          <span className="ed-faint"> · salud vegetación</span>
        </span>
        <span>
          NDWI <span className="ed-soft tabular-nums">{dep.ndwi.toFixed(2)}</span>
          <span className="ed-faint"> · humedad</span>
        </span>
        <ProvenancePill fuente={dep.fuente} />
      </div>

      {showSparkline && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          <p className="mb-1.5 text-[11px] ed-faint">Evolución NDVI · últimas capturas</p>
          <svg viewBox="0 0 120 30" className="w-full" aria-hidden>
            <path
              d={buildSparklinePath(serie, 120, 30)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
            />
          </svg>
        </div>
      )}
    </div>
  );
}

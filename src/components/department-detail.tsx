"use client";

import type { DepartamentoProps } from "@/lib/departamentos";
import {
  vegetationStatus,
  vegetationLabel,
  vegetationChipClass,
} from "@/lib/vegetation";
import { buildSparklinePath } from "@/lib/sparkline";

function ProvenancePill({ fuente }: { fuente: DepartamentoProps["fuente"] }) {
  const satelital = fuente === "satelital";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        satelital ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
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
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
        Hacé clic en un departamento para ver el detalle.
      </div>
    );
  }

  const status = vegetationStatus(dep.ndvi);
  const showSparkline = dep.nombre === "Arauco" && serie.length > 1;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            Departamento seleccionado
          </p>
          <h3 className="text-lg font-bold leading-tight text-emerald-950">
            {dep.nombre}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Limpiar selección
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${vegetationChipClass[status]}`}
        >
          {vegetationLabel[status]}
        </span>
        <ProvenancePill fuente={dep.fuente} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-black/5">
          <dt className="text-[11px] text-gray-500">NDVI (salud vegetación)</dt>
          <dd className="text-base font-semibold text-emerald-950">
            {dep.ndvi.toFixed(2)}
          </dd>
        </div>
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-black/5">
          <dt className="text-[11px] text-gray-500">NDWI (humedad)</dt>
          <dd className="text-base font-semibold text-emerald-950">
            {dep.ndwi.toFixed(2)}
          </dd>
        </div>
      </dl>

      {showSparkline && (
        <div className="mt-3 rounded-lg bg-white p-2.5 ring-1 ring-black/5">
          <p className="mb-1 text-[11px] text-gray-500">
            Evolución NDVI (últimas capturas)
          </p>
          <svg viewBox="0 0 120 30" className="w-full" aria-hidden>
            <path
              d={buildSparklinePath(serie, 120, 30)}
              fill="none"
              stroke="#1a9850"
              strokeWidth={2}
            />
          </svg>
        </div>
      )}
    </div>
  );
}

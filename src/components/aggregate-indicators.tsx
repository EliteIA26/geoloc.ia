"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchDepartamentos, type DepartamentoProps } from "@/lib/departamentos";
import {
  vegetationStatus,
  vegetationLabel,
  vegetationChipClass,
} from "@/lib/vegetation";

function ProvenancePill({ fuente }: { fuente: DepartamentoProps["fuente"] }) {
  const satelital = fuente === "satelital";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        satelital ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span aria-hidden>{satelital ? "●" : "○"}</span>
      {satelital ? "Satelital" : "Referencia"}
    </span>
  );
}

export default function AggregateIndicators({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (nombre: string) => void;
}) {
  const [items, setItems] = useState<DepartamentoProps[]>([]);

  useEffect(() => {
    fetchDepartamentos().then(setItems).catch(() => setItems([]));
  }, []);

  // Ranking: healthiest (highest NDVI) first.
  const ranked = useMemo(
    () => [...items].sort((a, b) => b.ndvi - a.ndvi),
    [items],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-emerald-900">
          Departamentos por salud
        </h2>
        <span className="text-[11px] text-gray-400">{ranked.length} · ranking NDVI</span>
      </div>
      <ul className="space-y-1.5">
        {ranked.map((it) => {
          const status = vegetationStatus(it.ndvi);
          const isSelected = selected === it.nombre;
          return (
            <li key={it.nombre}>
              <button
                type="button"
                onClick={() => onSelect(it.nombre)}
                aria-pressed={isSelected}
                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
                    : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-800">
                    {it.nombre}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-950">
                    {it.ndvi.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${vegetationChipClass[status]}`}
                  >
                    {vegetationLabel[status]}
                  </span>
                  <ProvenancePill fuente={it.fuente} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

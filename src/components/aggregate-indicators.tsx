"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchDepartamentos, type DepartamentoProps } from "@/lib/departamentos";
import {
  vegetationStatus,
  vegetationSentence,
  vegetationDotClass,
} from "@/lib/vegetation";
import type { ProvinciaNdvi } from "@/lib/satelital";

export default function AggregateIndicators({
  selected,
  onSelect,
  prov,
}: {
  selected: string | null;
  onSelect: (nombre: string) => void;
  prov: ProvinciaNdvi | null;
}) {
  const [items, setItems] = useState<DepartamentoProps[]>([]);

  useEffect(() => {
    fetchDepartamentos().then(setItems).catch(() => setItems([]));
  }, []);

  // Merge real MODIS means (fuente: "satelital") over geojson fallback.
  const merged = useMemo(
    () =>
      items.map((it) => {
        const modis = prov?.deptos[it.nombre];
        return modis !== undefined
          ? { ...it, ndvi: modis, fuente: "satelital" as const }
          : it;
      }),
    [items, prov],
  );

  // Ranking: healthiest (highest NDVI) first.
  const ranked = useMemo(
    () => [...merged].sort((a, b) => b.ndvi - a.ndvi),
    [merged],
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm ed-soft">Departamentos por salud</h2>
        <span className="text-[11px] ed-faint">
          {ranked.length} · ordenado por NDVI
          {prov ? ` · captura ${prov.fecha}` : ""}
        </span>
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
                className={`ed-card w-full p-3 text-left transition-colors ${
                  isSelected
                    ? "ring-1 ring-[var(--accent)]"
                    : "hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${vegetationDotClass[status]}`}
                      aria-hidden
                    />
                    <span className="truncate text-sm text-[var(--ink)]">{it.nombre}</span>
                  </span>
                  {/* Index demoted: small, muted, tabular. */}
                  <span className="shrink-0 text-[12px] tabular-nums ed-faint">
                    {it.ndvi.toFixed(2)}
                  </span>
                </div>
                {/* Insight first: the plain-language status leads the line. */}
                <p className="mt-1 pl-3.5 text-[12px] ed-soft">{vegetationSentence[status]}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

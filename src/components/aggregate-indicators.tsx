"use client";

import { useEffect, useState } from "react";
import { fetchJson, IndicadoresSchema, SeriesSchema, type Indicador } from "@/lib/data";
import { buildSparklinePath } from "@/lib/sparkline";

export default function AggregateIndicators() {
  const [items, setItems] = useState<Indicador[]>([]);
  const [serie, setSerie] = useState<number[]>([]);
  useEffect(() => {
    fetchJson("/data/indicadores-departamentos.json", IndicadoresSchema).then(setItems);
    fetchJson("/data/series-ndvi.json", SeriesSchema).then((s) => setSerie(s["arauco"] ?? []));
  }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-emerald-900">Indicadores por departamento</h2>
      {items.map((it) => (
        <div key={it.nombre} className="rounded border p-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{it.nombre}</span>
            <span>{it.areaEstresadaPct}% en estrés</span>
          </div>
          <div className="text-xs text-gray-500">NDVI medio {it.ndviMedio}</div>
        </div>
      ))}
      {serie.length > 1 && (
        <svg viewBox="0 0 120 30" className="w-full">
          <path d={buildSparklinePath(serie, 120, 30)} fill="none" stroke="#1a9850" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}

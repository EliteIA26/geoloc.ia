"use client";

import type { LayerKey } from "@/components/layer-toggle";

// Color stops shared with src/lib/colors.ts (red -> yellow -> green).
const RED = "#d73027";
const YELLOW = "#fee08b";
const GREEN = "#1a9850";

type Row = { color: string; label: string };

const LEGENDS: Record<
  LayerKey,
  { title: string; rows: [Row, Row, Row] }
> = {
  ndvi: {
    title: "Salud de la vegetación (NDVI satelital)",
    rows: [
      { color: RED, label: "Estrés / vegetación escasa" },
      { color: YELLOW, label: "Moderada" },
      { color: GREEN, label: "Saludable / densa" },
    ],
  },
  ndwi: {
    title: "Estrés hídrico (NDWI)",
    rows: [
      { color: RED, label: "Mayor estrés (seco)" },
      { color: YELLOW, label: "Estrés moderado" },
      { color: GREEN, label: "Sin estrés (húmedo)" },
    ],
  },
};

export default function MapLegend({ layer }: { layer: LayerKey }) {
  const { title, rows } = LEGENDS[layer];
  return (
    <div className="w-60 rounded-xl border border-border bg-card/90 p-3 shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-xs font-semibold leading-tight text-emerald-950">
        {title}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className="h-3.5 w-5 shrink-0 rounded-sm ring-1 ring-border"
              style={{ backgroundColor: r.color }}
              aria-hidden
            />
            <span className="text-[11px] leading-tight text-gray-700">{r.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-gray-200 pt-2 text-[10px] text-gray-500">
        Fuente: Sentinel-2 (Copernicus)
      </p>
    </div>
  );
}

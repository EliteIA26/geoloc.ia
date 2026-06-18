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
    <div className="w-fit min-w-[200px] rounded-xl border border-white/5 bg-card/60 p-3 shadow-lg backdrop-blur-md">
      <p className="mb-2 text-xs font-semibold leading-tight text-primary">
        {title}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className="h-3 w-4 shrink-0 rounded-sm shadow-[0_0_5px_rgba(0,0,0,0.5)]"
              style={{ backgroundColor: r.color }}
              aria-hidden
            />
            <span className="text-[11px] leading-tight text-muted-foreground">{r.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-white/5 pt-2 text-[9px] text-muted-foreground/60">
        Fuente: Sentinel-2 (Copernicus)
      </p>
    </div>
  );
}

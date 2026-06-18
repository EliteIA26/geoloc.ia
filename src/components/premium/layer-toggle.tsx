"use client";

import { Leaf, Droplets, Satellite } from "lucide-react";

export type LayerKey = "ndvi" | "ndwi" | "none";

export default function LayerToggle({
  active,
  onChange,
}: {
  active: LayerKey;
  onChange: (k: LayerKey) => void;
}) {
  const opts: { key: LayerKey; label: string; icon: React.ReactNode }[] = [
    { key: "ndvi", label: "Salud Vegetación", icon: <Leaf className="w-3.5 h-3.5" /> },
    { key: "ndwi", label: "Estrés Hídrico", icon: <Droplets className="w-3.5 h-3.5" /> },
    { key: "none", label: "Satélite Puro", icon: <Satellite className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="inline-flex gap-1 rounded-xl p-1 w-full bg-black/20 backdrop-blur-md shadow-inner border border-white/5">
      {opts.map((o) => {
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={isActive}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] sm:text-[12px] font-semibold transition-all duration-300 ${
              isActive
                ? o.key === 'none' 
                  ? "bg-slate-700 text-white shadow-lg shadow-slate-900/30"
                  : o.key === 'ndwi'
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                    : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

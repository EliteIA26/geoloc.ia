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
    <div className="inline-flex gap-0.5 rounded-xl p-0.5 w-fit bg-black/20 backdrop-blur-md border border-white/5">
      {opts.map((o) => {
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={isActive}
            className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[10px] sm:text-[11px] font-medium transition-all duration-300 ${
              isActive
                ? o.key === 'none' 
                  ? "bg-white/10 text-white shadow-lg"
                  : o.key === 'ndwi'
                    ? "bg-blue-500/20 text-blue-400 shadow-lg"
                    : "bg-primary/20 text-primary shadow-lg"
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

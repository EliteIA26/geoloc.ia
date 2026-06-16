"use client";

export type LayerKey = "ndvi" | "ndwi";

export default function LayerToggle({
  active,
  onChange,
}: {
  active: LayerKey;
  onChange: (k: LayerKey) => void;
}) {
  const opts: { key: LayerKey; label: string }[] = [
    { key: "ndvi", label: "Salud vegetación" },
    { key: "ndwi", label: "Estrés hídrico" },
  ];
  return (
    <div className="inline-flex gap-1 rounded-lg border border-black/5 bg-white/90 p-1 shadow-md backdrop-blur-sm">
      {opts.map((o) => {
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={isActive}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

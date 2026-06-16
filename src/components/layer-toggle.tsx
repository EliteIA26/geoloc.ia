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
    <div className="inline-flex overflow-hidden rounded-md border border-emerald-700">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-sm ${
            active === o.key ? "bg-emerald-700 text-white" : "bg-white text-emerald-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

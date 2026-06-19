"use client";

// Static map legend so the dots/route are self-explanatory.
export default function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 space-y-1 rounded-xl border border-white/10 bg-black/65 px-3 py-2 text-[11px] text-white/90 backdrop-blur-md">
      <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" /> Localidades</div>
      <div className="flex items-center gap-2"><span className="text-amber-300">★</span> Atractivos</div>
      <div className="flex items-center gap-2"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-amber-400" /> Corredor RN76 → Chile</div>
    </div>
  );
}

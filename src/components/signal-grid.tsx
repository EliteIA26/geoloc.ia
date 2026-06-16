"use client";

// Compact grid of digested signals (soil moisture, rain deficit, GDD, …). Each
// cell leads with a small status dot + label and shows the value muted — the
// numbers are secondary evidence, never the headline. `nivel` matches the
// `Senal.nivel` contract from src/lib/agroclimate.ts.

export type Signal = { etiqueta: string; valor: string; nivel: "ok" | "atencion" | "alerta" | "neutro" };

const DOT: Record<Signal["nivel"], string> = {
  ok: "bg-emerald-500",
  atencion: "bg-amber-500",
  alerta: "bg-red-500",
  neutro: "bg-stone-300",
};

export default function SignalGrid({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {signals.map((s, i) => (
        <div key={i} className="ed-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] ed-faint">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.nivel]}`} />
            {s.etiqueta}
          </div>
          <div className="mt-1 text-[15px] text-[var(--ink)]">{s.valor}</div>
        </div>
      ))}
    </div>
  );
}

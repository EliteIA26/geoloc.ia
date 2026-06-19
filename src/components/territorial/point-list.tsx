"use client";

import type { Punto } from "@/lib/bermejo-puntos";

export default function PointList({
  puntos,
  selectedId,
  onSelect,
}: {
  puntos: Punto[];
  selectedId: string | null;
  onSelect: (p: Punto) => void;
}) {
  if (puntos.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm text-foreground">Puntos del valle</h3>
      <ul className="space-y-1">
        {puntos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              aria-pressed={p.id === selectedId}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                p.id === selectedId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span aria-hidden className={p.tipo === "atractivo" ? "text-amber-500" : "text-sky-500"}>
                {p.tipo === "atractivo" ? "★" : "●"}
              </span>
              <span className="truncate">{p.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

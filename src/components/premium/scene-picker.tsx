"use client";

import type { Escena } from "@/lib/satelital";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-05-24" -> "24 may"; falls back to the raw string if unparseable.
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, , mo, d] = m;
  return `${Number(d)} ${MESES[Number(mo) - 1] ?? mo}`;
}

// Cloud-cover tone: clearer scenes read greener.
function nubeTone(n: number): string {
  if (n < 10) return "text-emerald-700";
  if (n < 30) return "text-amber-700";
  return "text-red-700";
}

// Horizontal strip of selectable scene dates with a cloud-cover badge each.
// Renders nothing until the manifest provides at least one scene.
export default function ScenePicker({
  escenas,
  selected,
  onSelect,
}: {
  escenas: Escena[];
  selected: string;
  onSelect: (fecha: string) => void;
}) {
  if (escenas.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {escenas.map((e) => {
        const active = e.fecha === selected;
        return (
          <button
            key={e.fecha}
            type="button"
            onClick={() => onSelect(e.fecha)}
            aria-pressed={active}
            className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-lg border px-2.5 py-1.5 text-center transition-colors ${
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="text-xs font-medium capitalize">{fechaCorta(e.fecha)}</span>
            <span className={`text-[10px] ${nubeTone(e.nubes)}`}>{Math.round(e.nubes)}% nub.</span>
          </button>
        );
      })}
    </div>
  );
}

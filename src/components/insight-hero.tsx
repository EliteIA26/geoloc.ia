"use client";

// Editorial "insight-first" hero. Each view opens with this: a plain-language
// headline (the AI resumen / recommendation) as the protagonist, with risks as
// small tone chips and an optional action line + provenance footer. Raw indices
// are NOT shown here — they live demoted as secondary evidence elsewhere.

export type HeroChip = { label: string; tone: "alerta" | "atencion" | "ok" | "info" };

const TONE: Record<HeroChip["tone"], string> = {
  alerta: "bg-red-50 text-red-800",
  atencion: "bg-amber-50 text-amber-800",
  ok: "bg-emerald-50 text-emerald-800",
  info: "bg-sky-50 text-sky-800",
};

export default function InsightHero({
  eyebrow,
  titulo,
  chips,
  accion,
  footer,
}: {
  eyebrow: string;
  titulo: string;
  chips: HeroChip[];
  accion?: string;
  footer?: string;
}) {
  return (
    <div className="ed-card p-5">
      <div className="mb-2.5 text-xs ed-faint">{eyebrow}</div>
      <p className="m-0 text-[16px] leading-relaxed text-[var(--ink)]">{titulo}</p>
      {chips.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className={`rounded-full px-3 py-1 text-[13px] ${TONE[c.tone]}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}
      {accion && (
        <p className="mt-3.5 border-t border-[var(--hairline)] pt-3 text-sm ed-soft">{accion}</p>
      )}
      {footer && <p className="mt-2 text-[11px] ed-faint">{footer}</p>}
    </div>
  );
}

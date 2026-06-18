"use client";

import { ndviTrend } from "@/lib/satelital";

export default function TrendBadge({ actual, anterior }: { actual: number; anterior: number }) {
  const t = ndviTrend(actual, anterior);
  const tone =
    t.label === "mejoró"
      ? "bg-emerald-50 text-emerald-800"
      : t.label === "empeoró"
        ? "bg-red-50 text-red-800"
        : "bg-muted text-stone-700";
  const arrow = t.label === "mejoró" ? "↑" : t.label === "empeoró" ? "↓" : "→";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] ${tone}`}>
      {arrow} Vegetación {t.label} {Math.abs(t.pct)}% vs. hace ~1 mes
    </span>
  );
}

"use client";

import { buildSparklinePath } from "@/lib/sparkline";

export default function NdviTimeSeries({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg viewBox="0 0 240 60" className="w-full rounded border bg-white">
      <path d={buildSparklinePath(values, 240, 60)} fill="none" stroke="#1a9850" strokeWidth={2} />
    </svg>
  );
}

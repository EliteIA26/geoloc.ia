"use client";

import { classifyWaterStress, type StressLevel } from "@/lib/water-stress";

const styles: Record<StressLevel, string> = {
  verde: "bg-green-100 text-green-800",
  ambar: "bg-amber-100 text-amber-800",
  rojo: "bg-red-100 text-red-800",
};

export default function WaterStressBadge({ index }: { index: number }) {
  const level = classifyWaterStress(index);
  return <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${styles[level]}`}>{level}</span>;
}

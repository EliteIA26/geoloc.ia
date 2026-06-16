// Discrete NDVI color ramp (red -> yellow -> green). Thresholds are inclusive lower bounds.
const NDVI_STOPS: ReadonlyArray<[number, string]> = [
  [0.6, "#1a9850"], // healthy
  [0.4, "#fee08b"], // moderate
  [-1, "#d73027"], // stressed / bare
];

export function ndviToColor(value: number): string {
  const v = Math.max(-1, Math.min(1, value));
  for (const [min, color] of NDVI_STOPS) {
    if (v >= min) return color;
  }
  return "#d73027";
}

// NDWI reuses the same ramp shape; higher = more moisture = greener.
export function ndwiToColor(value: number): string {
  return ndviToColor(value);
}

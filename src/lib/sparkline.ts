export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // avoid divide-by-zero on flat series
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = Math.round(i * stepX);
    const y = Math.round(height - ((v - min) / span) * height);
    return `${x} ${y}`;
  });
  return `M ${points[0]} ` + points.slice(1).map((p) => `L ${p}`).join(" ");
}

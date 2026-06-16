export type Crop = "olivo" | "vid";
export type RiesgoTipo = "helada" | "deficit_hidrico" | "calor" | "incendio" | "sequia";
export type Nivel = "bajo" | "medio" | "alto";
export type Riesgo = { tipo: RiesgoTipo; nivel: Nivel; dia: string; detalle: string };
export type Senal = { clave: string; etiqueta: string; valor: string; nivel: "ok" | "atencion" | "alerta" | "neutro" };

// Demo defaults — require agronomic calibration (INTA) before production use.
const FROST_C: Record<Crop, { medio: number; alto: number }> = {
  olivo: { medio: 0, alto: -3 },
  vid: { medio: 2, alto: 0 },
};
const HEAT_C: Record<Crop, { medio: number; alto: number }> = {
  olivo: { medio: 38, alto: 42 },
  vid: { medio: 35, alto: 38 },
};

function bump(n: Nivel): Nivel {
  return n === "bajo" ? "medio" : "alto";
}

export function frostRisk(tmin: number[], fechas: string[], crop: Crop): Riesgo | null {
  const t = FROST_C[crop];
  let idx = -1;
  let min = Infinity;
  tmin.forEach((v, i) => {
    if (v < min) {
      min = v;
      idx = i;
    }
  });
  if (idx < 0 || min > t.medio) return null;
  const nivel: Nivel = min <= t.alto ? "alto" : "medio";
  return { tipo: "helada", nivel, dia: fechas[idx], detalle: `Mínima prevista de ${min}°C el ${fechas[idx]}.` };
}

export function heatRisk(tmax: number[], fechas: string[], crop: Crop): Riesgo | null {
  const t = HEAT_C[crop];
  let idx = -1;
  let max = -Infinity;
  tmax.forEach((v, i) => {
    if (v > max) {
      max = v;
      idx = i;
    }
  });
  if (idx < 0 || max < t.medio) return null;
  const nivel: Nivel = max >= t.alto ? "alto" : "medio";
  return { tipo: "calor", nivel, dia: fechas[idx], detalle: `Máxima prevista de ${max}°C el ${fechas[idx]}.` };
}

export function waterDeficitRisk(et0: number[], precip: number[], ndvi: number): Riesgo | null {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const balance = Math.round(sum(et0) - sum(precip));
  if (balance < 20) return null;
  let nivel: Nivel = balance >= 35 ? "alto" : "medio";
  if (ndvi < 0.4) nivel = bump(nivel);
  return { tipo: "deficit_hidrico", nivel, dia: "esta semana", detalle: `Déficit hídrico acumulado de ~${balance} mm (ET₀ menos lluvia) en 7 días.` };
}

const TXT: Record<RiesgoTipo, string> = {
  helada: "protegé los brotes ante la helada",
  deficit_hidrico: "programá riego",
  calor: "reforzá riego por el calor",
  incendio: "extremá precauciones por riesgo de incendio",
  sequia: "monitoreá la sequía y priorizá el riego",
};

export function ruleBasedRecommendation(riesgos: Riesgo[]): string {
  if (riesgos.length === 0) {
    return "Sin alertas para los próximos 7 días: condiciones adecuadas, sin acciones urgentes.";
  }
  const acciones = riesgos
    .slice()
    .sort((a) => (a.nivel === "alto" ? -1 : 1))
    .map((r) => TXT[r.tipo]);
  return `Esta semana: ${Array.from(new Set(acciones)).join("; ")}.`;
}

// Demo defaults — require agronomic calibration (INTA) before production use.
export function fireRisk(tmax: number[], windMax: number[], humMin: number[], lluvia7: number): Riesgo | null {
  let idx = -1, score = -1;
  tmax.forEach((t, i) => {
    const s = (t >= 32 ? 1 : 0) + (windMax[i] >= 30 ? 1 : 0) + (humMin[i] <= 25 ? 1 : 0) + (lluvia7 < 5 ? 1 : 0);
    if (s > score) { score = s; idx = i; }
  });
  if (score < 2) return null;
  const nivel: Nivel = score >= 4 ? "alto" : score === 3 ? "medio" : "bajo";
  return { tipo: "incendio", nivel, dia: fechasAt(idx), detalle: `Calor, viento y baja humedad: condiciones de riesgo de incendio.` };
  function fechasAt(i: number) { return `día ${i + 1}`; }
}

export function soilMoistureStatus(frac: number): Senal {
  const nivel = frac < 0.12 ? "alerta" : frac < 0.2 ? "atencion" : "ok";
  return { clave: "suelo", etiqueta: "Humedad del suelo", valor: `${Math.round(frac * 100)}%`, nivel };
}

export function growingDegreeDays(tmin: number[], tmax: number[], base: number): { gdd: number; etiqueta: string } {
  const gdd = Math.round(tmin.reduce((acc, t, i) => acc + Math.max(0, (t + tmax[i]) / 2 - base), 0));
  return { gdd, etiqueta: `${gdd} °C·día acumulados (base ${base}°C)` };
}

export function applicationWindow(windMax: number[], fechas: string[]): string[] {
  return fechas.filter((_, i) => windMax[i] < 20);
}

export function rainDeficit(lluvia30: number, normal: number): Senal {
  const ratio = normal > 0 ? lluvia30 / normal : 1;
  const nivel = ratio < 0.25 ? "alerta" : ratio < 0.6 ? "atencion" : "ok";
  return { clave: "deficit", etiqueta: "Lluvia últimos 30 días", valor: `${Math.round(lluvia30)} mm`, nivel };
}

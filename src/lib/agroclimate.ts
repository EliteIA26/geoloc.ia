export type Crop = "olivo" | "vid";
export type RiesgoTipo = "helada" | "deficit_hidrico" | "calor";
export type Nivel = "bajo" | "medio" | "alto";
export type Riesgo = { tipo: RiesgoTipo; nivel: Nivel; dia: string; detalle: string };

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

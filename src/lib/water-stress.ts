export type StressLevel = "verde" | "ambar" | "rojo";

export function classifyWaterStress(index: number): StressLevel {
  if (index < 0.35) return "rojo";
  if (index < 0.6) return "ambar";
  return "verde";
}

export function irrigationHint(index: number): string {
  switch (classifyWaterStress(index)) {
    case "rojo":
      return "Estrés hídrico alto: se recomienda riego prioritario en esta finca.";
    case "ambar":
      return "Estrés hídrico moderado: monitorear y programar riego en los próximos días.";
    case "verde":
      return "Humedad adecuada: no se requiere riego adicional por ahora.";
  }
}

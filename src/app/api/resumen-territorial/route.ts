import { fetchForecast } from "@/lib/open-meteo";
import { frostRisk, heatRisk, waterDeficitRisk, fireRisk, type Riesgo } from "@/lib/agroclimate";
import { generateTerritorialResumen } from "@/lib/ai-narrative";
import { CENTROIDES } from "@/lib/departamento-centroids";

export async function GET() {
  try {
    const results = await Promise.all(
      CENTROIDES.map(async (c) => {
        try {
          const f = await fetchForecast(c.lat, c.lon);
          const tmin = f.dias.map((d) => d.tmin), tmax = f.dias.map((d) => d.tmax);
          const et0 = f.dias.map((d) => d.et0), lluvia = f.dias.map((d) => d.lluvia);
          const viento = f.dias.map((d) => d.vientoMax), hum = f.dias.map((d) => d.humedadMin);
          const fechas = f.dias.map((d) => d.fecha);
          const lluvia7 = lluvia.reduce((a, b) => a + b, 0);
          const riesgos: Riesgo[] = [
            frostRisk(tmin, fechas, "olivo"), heatRisk(tmax, fechas, "olivo"),
            waterDeficitRisk(et0, lluvia, 0.45), fireRisk(tmax, viento, hum, lluvia7),
          ].filter((r): r is Riesgo => r !== null);
          return { nombre: c.nombre, riesgos: riesgos.map((r) => r.tipo) };
        } catch {
          return { nombre: c.nombre, riesgos: [] as string[] };
        }
      }),
    );
    const enRiesgo = results.filter((r) => r.riesgos.length);
    const cacheKey = `terr|${new Date().toISOString().slice(0, 10)}`;
    const resumenIA = await Promise.race([
      generateTerritorialResumen(results, cacheKey),
      new Promise<null>((r) => setTimeout(() => r(null), 9000)),
    ]);
    const reglaResumen = enRiesgo.length
      ? `${enRiesgo.length} departamento(s) con alertas esta semana: ${enRiesgo.map((r) => r.nombre).join(", ")}.`
      : "Sin alertas relevantes en la provincia esta semana.";
    return Response.json({
      resumen: resumenIA ?? reglaResumen,
      fuenteIA: Boolean(resumenIA),
      deptosEnRiesgo: enRiesgo,
      actualizado: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "No se pudo generar el resumen" }, { status: 502 });
  }
}

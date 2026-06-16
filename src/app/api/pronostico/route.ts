import { fetchForecast } from "@/lib/open-meteo";
import {
  frostRisk, heatRisk, waterDeficitRisk, fireRisk, soilMoistureStatus,
  growingDegreeDays, applicationWindow, rainDeficit, ruleBasedRecommendation,
  type Crop, type Riesgo, type Senal,
} from "@/lib/agroclimate";
import { generateNarrative } from "@/lib/ai-narrative";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const crop = (searchParams.get("crop") === "vid" ? "vid" : "olivo") as Crop;
  const ndvi = Number(searchParams.get("ndvi") ?? "0.5");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "lat/lon inválidos" }, { status: 400 });
  }
  try {
    const f = await fetchForecast(lat, lon);
    const tmin = f.dias.map((d) => d.tmin), tmax = f.dias.map((d) => d.tmax);
    const et0 = f.dias.map((d) => d.et0), lluvia = f.dias.map((d) => d.lluvia);
    const viento = f.dias.map((d) => d.vientoMax), hum = f.dias.map((d) => d.humedadMin);
    const fechas = f.dias.map((d) => d.fecha);
    const lluvia7 = lluvia.reduce((a, b) => a + b, 0);

    const riesgos: Riesgo[] = [
      frostRisk(tmin, fechas, crop), heatRisk(tmax, fechas, crop),
      waterDeficitRisk(et0, lluvia, ndvi), fireRisk(tmax, viento, hum, lluvia7),
    ].filter((r): r is Riesgo => r !== null);

    const senales: Senal[] = [
      soilMoistureStatus(f.sueloFrac),
      rainDeficit(f.lluviaPrev30, 40),
      { clave: "gdd", etiqueta: "Grados-día", valor: growingDegreeDays(tmin, tmax, crop === "olivo" ? 10 : 10).etiqueta, nivel: "neutro" },
    ];
    const ventana = applicationWindow(viento, fechas);

    const reglaRec = ruleBasedRecommendation(riesgos);
    const cacheKey = `${fechas[0]}|${lat.toFixed(3)}|${lon.toFixed(3)}|${crop}|v2`;
    const narrativa = await Promise.race([
      generateNarrative(f, riesgos, crop, cacheKey),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);

    return Response.json({
      dias: f.dias, riesgos, senales, ventana,
      recomendacion: narrativa ?? reglaRec, fuenteIA: Boolean(narrativa),
      actualizado: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "No se pudo obtener el pronóstico" }, { status: 502 });
  }
}

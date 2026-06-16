import { fetchForecast } from "@/lib/open-meteo";
import { frostRisk, heatRisk, waterDeficitRisk, ruleBasedRecommendation, type Crop, type Riesgo } from "@/lib/agroclimate";
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
    const forecast = await fetchForecast(lat, lon);
    const tmin = forecast.dias.map((d) => d.tmin);
    const tmax = forecast.dias.map((d) => d.tmax);
    const et0 = forecast.dias.map((d) => d.et0);
    const lluvia = forecast.dias.map((d) => d.lluvia);
    const fechas = forecast.dias.map((d) => d.fecha);

    const riesgos: Riesgo[] = [
      frostRisk(tmin, fechas, crop),
      heatRisk(tmax, fechas, crop),
      waterDeficitRisk(et0, lluvia, ndvi),
    ].filter((r): r is Riesgo => r !== null);

    const reglaRec = ruleBasedRecommendation(riesgos);
    const cacheKey = `${fechas[0]}|${lat.toFixed(3)}|${lon.toFixed(3)}|${crop}`;

    const narrativa = await Promise.race([
      generateNarrative(forecast, riesgos, crop, cacheKey),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);

    return Response.json({
      dias: forecast.dias,
      riesgos,
      recomendacion: narrativa ?? reglaRec,
      fuenteIA: Boolean(narrativa),
      actualizado: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "No se pudo obtener el pronóstico" }, { status: 502 });
  }
}

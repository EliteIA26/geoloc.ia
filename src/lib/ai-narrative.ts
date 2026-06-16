import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Forecast } from "./open-meteo";
import type { Crop, Riesgo } from "./agroclimate";

const SYSTEM =
  "Sos un asesor agronómico para La Rioja, Argentina. Redactás en español rioplatense, claro y breve (2-3 frases). " +
  "Usá ÚNICAMENTE los datos que te paso (no inventes temperaturas, fechas ni cifras). " +
  "Dirigite al productor con recomendaciones accionables y concretas para los próximos días.";

export function buildNarrativePrompt(f: Forecast, riesgos: Riesgo[], crop: Crop): string {
  const dias = f.dias
    .map((d) => `${d.fecha}: min ${d.tmin}°C, max ${d.tmax}°C, lluvia ${d.lluvia}mm, ET₀ ${d.et0}mm`)
    .join("\n");
  const r = riesgos.length
    ? riesgos.map((x) => `- ${x.tipo} (${x.nivel}) ${x.dia}: ${x.detalle}`).join("\n")
    : "Sin riesgos detectados.";
  return (
    `Cultivo: ${crop}\n\nPronóstico 7 días:\n${dias}\n\nRiesgos detectados:\n${r}\n\n` +
    `Escribí una recomendación breve para el productor basada SOLO en lo anterior.`
  );
}

const cache = new Map<string, string>();

export async function generateNarrative(
  f: Forecast,
  riesgos: Riesgo[],
  crop: Crop,
  cacheKey: string,
): Promise<string | null> {
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: SYSTEM,
      prompt: buildNarrativePrompt(f, riesgos, crop),
      temperature: 0.4,
      maxOutputTokens: 220,
    });
    const out = text.trim();
    if (out) cache.set(cacheKey, out);
    return out || null;
  } catch {
    return null;
  }
}

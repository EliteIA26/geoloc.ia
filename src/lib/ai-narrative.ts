import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Forecast } from "./open-meteo";
import type { Crop, Riesgo } from "./agroclimate";

export function stripMarkdown(s: string): string {
  return s
    .replace(/[*_`#>]/g, " ")        // markdown emphasis/heading/code/quote marks
    .replace(/^\s*[-•]\s*/gm, " ")    // bullet markers
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

const SYSTEM =
  "Sos un asesor agronómico para La Rioja, Argentina. Redactás en español rioplatense, claro y breve (2-3 frases). " +
  "Usá ÚNICAMENTE los datos que te paso (no inventes temperaturas, fechas ni cifras). " +
  "Dirigite al productor con recomendaciones accionables y concretas para los próximos días." +
  " Respondé en texto plano: sin markdown, sin asteriscos (*) ni almohadillas (#) ni viñetas.";

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
    const out = stripMarkdown(text);
    if (out) cache.set(cacheKey, out);
    return out || null;
  } catch {
    return null;
  }
}

const SYSTEM_GOV =
  "Sos asesor territorial para el gobierno de La Rioja, Argentina. Español rioplatense, claro y breve (2-3 frases). " +
  "Usá ÚNICAMENTE los datos que te paso (no inventes). Decí qué priorizar esta semana y dónde, en lenguaje que un funcionario no técnico entienda." +
  " Respondé en texto plano: sin markdown, sin asteriscos (*) ni almohadillas (#) ni viñetas.";

export function buildTerritorialPrompt(deps: { nombre: string; riesgos: string[] }[]): string {
  const enRiesgo = deps.filter((d) => d.riesgos.length);
  const cuerpo = enRiesgo.length
    ? enRiesgo.map((d) => `- ${d.nombre}: ${d.riesgos.join(", ")}`).join("\n")
    : "Sin riesgos relevantes esta semana.";
  return `Riesgos por departamento (próximos 7 días):\n${cuerpo}\n\nEscribí un resumen de gestión SOLO con lo anterior: qué priorizar y dónde.`;
}

export async function generateTerritorialResumen(
  deps: { nombre: string; riesgos: string[] }[],
  cacheKey: string,
): Promise<string | null> {
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: SYSTEM_GOV,
      prompt: buildTerritorialPrompt(deps),
      temperature: 0.4,
      maxOutputTokens: 240,
    });
    const out = stripMarkdown(text);
    if (out) cache.set(cacheKey, out);
    return out || null;
  } catch {
    return null;
  }
}

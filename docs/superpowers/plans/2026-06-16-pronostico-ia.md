# Pronóstico IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7-day weather forecast + grounded AI recommendation panel to the "mi finca" (Vista Productor), turning the panel from descriptive (NDVI snapshot) into proactive.

**Architecture:** First backend in geoloc.ia. A Next 16 Route Handler (`/api/pronostico`) fetches a live Open-Meteo forecast (cached ~3h), computes agroclimatic risks with pure testable functions, builds a rule-based recommendation, then asks Claude (AI SDK) to turn the real numbers + risks into a localized Spanish narrative — with an in-memory cache and a graceful fallback to the rule-based text if the LLM fails/times out. The client `ForecastPanel` renders it inside the producer's finca sidebar.

**Tech Stack:** Next 16 Route Handler, Open-Meteo (free, no key), AI SDK (`ai` + `@ai-sdk/anthropic`, Claude Haiku), Zod, Vitest.

---

## File Structure

```
src/
├── lib/
│   ├── open-meteo.ts        # fetchForecast(lat,lon) -> zod-validated Forecast (server-usable)
│   ├── open-meteo.test.ts   # parser test against a sample payload (no network)
│   ├── agroclimate.ts       # PURE: risk functions + rule-based recommendation + crop thresholds
│   ├── agroclimate.test.ts  # TDD for the thresholds + recommendation
│   └── ai-narrative.ts      # server-only: buildPrompt (pure) + generateNarrative (Claude, cached, fallback)
├── app/
│   └── api/
│       └── pronostico/
│           └── route.ts     # GET handler orchestrating the three libs -> JSON
└── components/
    └── forecast-panel.tsx   # client: fetch /api/pronostico, render chips + risk badges + recommendation
```
Modify: `src/components/producer-view.tsx` (mount `<ForecastPanel>` with the finca centroid).
Add: `.env.example` (documents `ANTHROPIC_API_KEY`, no value).

**Shared data contract (used across tasks — keep names identical):**
```ts
export type DiaForecast = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number };
export type Forecast = { dias: DiaForecast[] };
export type Crop = "olivo" | "vid";
export type RiesgoTipo = "helada" | "deficit_hidrico" | "calor";
export type Nivel = "bajo" | "medio" | "alto";
export type Riesgo = { tipo: RiesgoTipo; nivel: Nivel; dia: string; detalle: string };
export type PronosticoResponse = {
  dias: DiaForecast[];
  riesgos: Riesgo[];
  recomendacion: string;
  fuenteIA: boolean;
  actualizado: string; // ISO
};
```

> **Secrets:** `ANTHROPIC_API_KEY` is read ONLY server-side via `process.env`. It must NEVER be committed (repo is public) and never reach the client. The user adds it to Vercel env vars and to a local `.env.local` (already matched by `.env*.local` in `.gitignore`).

> **API verification:** AI SDK changes fast. Before writing Task 4/5 LLM code, confirm the installed `ai` version's option name for the output-token cap (`maxOutputTokens` in v5+, was `maxTokens`) and that `anthropic('claude-haiku-4-5-20251001')` is accepted (alias `claude-haiku-4-5` is the fallback). Open-Meteo + Route Handler APIs were confirmed against current docs.

---

## Task 1: Install deps + env scaffold

**Files:**
- Modify: `package.json` (deps)
- Create: `.env.example`

- [ ] **Step 1: Install runtime deps**

Run (inside `geoloc.ia`):
```bash
npm install ai @ai-sdk/anthropic
```
Expected: `ai` and `@ai-sdk/anthropic` appear in `dependencies`.

- [ ] **Step 2: Create `.env.example`**

```
# Server-only. Add the real value to .env.local (gitignored) and to Vercel env vars.
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Confirm `.env.local` is ignored**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (it is ignored via `.env*.local`). If it prints nothing, add `.env.local` to `.gitignore`.

- [ ] **Step 4: Build sanity**

Run: `npm run build`
Expected: clean (no usage yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add AI SDK (anthropic) deps + env scaffold for pronóstico"
```

---

## Task 2: agroclimate.ts — pure risk models (TDD)

**Files:**
- Create: `src/lib/agroclimate.ts`
- Test: `src/lib/agroclimate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agroclimate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { frostRisk, heatRisk, waterDeficitRisk, ruleBasedRecommendation } from "./agroclimate";

const fechas = ["2026-06-16", "2026-06-17", "2026-06-18"];

describe("frostRisk (olivo)", () => {
  it("returns null when no cold day", () => {
    expect(frostRisk([8, 6, 10], fechas, "olivo")).toBeNull();
  });
  it("medio when a min hits 0 or below (>-3)", () => {
    const r = frostRisk([8, -1, 5], fechas, "olivo");
    expect(r?.tipo).toBe("helada");
    expect(r?.nivel).toBe("medio");
    expect(r?.dia).toBe("2026-06-17");
  });
  it("alto when a min is <= -3", () => {
    expect(frostRisk([2, -4, 1], fechas, "olivo")?.nivel).toBe("alto");
  });
});

describe("heatRisk (olivo)", () => {
  it("null below threshold", () => {
    expect(heatRisk([30, 33, 31], fechas, "olivo")).toBeNull();
  });
  it("medio at >=38, alto at >=42", () => {
    expect(heatRisk([38, 35, 30], fechas, "olivo")?.nivel).toBe("medio");
    expect(heatRisk([30, 43, 30], fechas, "olivo")?.nivel).toBe("alto");
  });
});

describe("waterDeficitRisk", () => {
  it("null when balance is low", () => {
    expect(waterDeficitRisk([3, 3, 3], [5, 5, 5], 0.6)).toBeNull();
  });
  it("medio for moderate accumulated deficit", () => {
    // et0 sum 30, rain sum 5 -> balance 25 -> medio
    expect(waterDeficitRisk([10, 10, 10], [2, 2, 1], 0.6)?.nivel).toBe("medio");
  });
  it("escalates a level when ndvi is already low (stressed)", () => {
    // same balance 25 but ndvi 0.3 -> bumped to alto
    expect(waterDeficitRisk([10, 10, 10], [2, 2, 1], 0.3)?.nivel).toBe("alto");
  });
});

describe("ruleBasedRecommendation", () => {
  it("reassures when no risks", () => {
    expect(ruleBasedRecommendation([])).toMatch(/sin alertas|adecuad/i);
  });
  it("mentions riego when water deficit present", () => {
    const rec = ruleBasedRecommendation([
      { tipo: "deficit_hidrico", nivel: "alto", dia: "esta semana", detalle: "x" },
    ]);
    expect(rec).toMatch(/rieg/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- agroclimate`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/agroclimate.ts`:
```ts
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
  let worst = -Infinity ? null : null; // placeholder replaced below
  let idx = -1;
  let min = Infinity;
  tmin.forEach((v, i) => {
    if (v < min) { min = v; idx = i; }
  });
  if (idx < 0 || min > t.medio) return null;
  const nivel: Nivel = min <= t.alto ? "alto" : "medio";
  return {
    tipo: "helada",
    nivel,
    dia: fechas[idx],
    detalle: `Mínima prevista de ${min}°C el ${fechas[idx]}.`,
  };
}

export function heatRisk(tmax: number[], fechas: string[], crop: Crop): Riesgo | null {
  const t = HEAT_C[crop];
  let idx = -1;
  let max = -Infinity;
  tmax.forEach((v, i) => {
    if (v > max) { max = v; idx = i; }
  });
  if (idx < 0 || max < t.medio) return null;
  const nivel: Nivel = max >= t.alto ? "alto" : "medio";
  return {
    tipo: "calor",
    nivel,
    dia: fechas[idx],
    detalle: `Máxima prevista de ${max}°C el ${fechas[idx]}.`,
  };
}

export function waterDeficitRisk(et0: number[], precip: number[], ndvi: number): Riesgo | null {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const balance = Math.round(sum(et0) - sum(precip));
  if (balance < 20) return null;
  let nivel: Nivel = balance >= 35 ? "alto" : "medio";
  if (ndvi < 0.4) nivel = bump(nivel); // already-stressed crop escalates
  return {
    tipo: "deficit_hidrico",
    nivel,
    dia: "esta semana",
    detalle: `Déficit hídrico acumulado de ~${balance} mm (ET₀ menos lluvia) en 7 días.`,
  };
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
    .sort((a, b) => (a.nivel === "alto" ? -1 : 1))
    .map((r) => TXT[r.tipo]);
  return `Esta semana: ${Array.from(new Set(acciones)).join("; ")}.`;
}
```

> Note: remove the dead `worst` placeholder line if your linter flags it; it exists only to mark the original scaffold and serves no purpose. Final `frostRisk` should not contain it.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- agroclimate`
Expected: PASS. (Clean up the `worst` line so `npm run lint` stays green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agroclimate.ts src/lib/agroclimate.test.ts
git commit -m "feat: agroclimate risk models (frost/heat/water-deficit) + rule recommendation, TDD"
```

---

## Task 3: open-meteo.ts — live forecast fetch + parser (test the parser)

**Files:**
- Create: `src/lib/open-meteo.ts`
- Test: `src/lib/open-meteo.test.ts`

- [ ] **Step 1: Write the failing test (parser only, no network)**

Create `src/lib/open-meteo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseForecast } from "./open-meteo";

const sample = {
  daily: {
    time: ["2026-06-16", "2026-06-17"],
    temperature_2m_max: [22.4, 24.1],
    temperature_2m_min: [3.2, -1.0],
    precipitation_sum: [0, 1.5],
    et0_fao_evapotranspiration: [4.1, 4.4],
  },
};

describe("parseForecast", () => {
  it("maps the daily arrays into per-day objects", () => {
    const f = parseForecast(sample);
    expect(f.dias).toHaveLength(2);
    expect(f.dias[1]).toEqual({ fecha: "2026-06-17", tmin: -1.0, tmax: 24.1, lluvia: 1.5, et0: 4.4 });
  });
  it("throws on a malformed payload", () => {
    expect(() => parseForecast({ daily: { time: ["x"] } })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- open-meteo`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/open-meteo.ts`:
```ts
import { z } from "zod";

export type DiaForecast = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number };
export type Forecast = { dias: DiaForecast[] };

const DailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    et0_fao_evapotranspiration: z.array(z.number()),
  }),
});

export function parseForecast(raw: unknown): Forecast {
  const d = DailySchema.parse(raw).daily;
  const dias: DiaForecast[] = d.time.map((fecha, i) => ({
    fecha,
    tmin: d.temperature_2m_min[i],
    tmax: d.temperature_2m_max[i],
    lluvia: d.precipitation_sum[i],
    et0: d.et0_fao_evapotranspiration[i],
  }));
  return { dias };
}

// Live fetch, cached ~3h via Next's fetch revalidate. No API key required.
export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
    `&forecast_days=7&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 10800 } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- open-meteo`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/open-meteo.ts src/lib/open-meteo.test.ts
git commit -m "feat: Open-Meteo live forecast fetch + zod parser with test"
```

---

## Task 4: ai-narrative.ts — grounded Claude narrative (prompt builder tested)

**Files:**
- Create: `src/lib/ai-narrative.ts`
- Test: `src/lib/ai-narrative.test.ts`

- [ ] **Step 1: Write the failing test (prompt builder is pure/testable)**

Create `src/lib/ai-narrative.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildNarrativePrompt } from "./ai-narrative";
import type { Forecast } from "./open-meteo";
import type { Riesgo } from "./agroclimate";

const forecast: Forecast = {
  dias: [
    { fecha: "2026-06-16", tmin: 3, tmax: 22, lluvia: 0, et0: 4 },
    { fecha: "2026-06-17", tmin: -1, tmax: 24, lluvia: 0, et0: 5 },
  ],
};
const riesgos: Riesgo[] = [
  { tipo: "helada", nivel: "medio", dia: "2026-06-17", detalle: "Mínima -1°C" },
];

describe("buildNarrativePrompt", () => {
  it("embeds the real numbers and risks so the model is grounded", () => {
    const p = buildNarrativePrompt(forecast, riesgos, "olivo");
    expect(p).toContain("2026-06-17");
    expect(p).toContain("-1");
    expect(p).toContain("helada");
    expect(p).toMatch(/olivo/i);
  });
  it("instructs to use ONLY the given data (no invention)", () => {
    expect(buildNarrativePrompt(forecast, [], "olivo")).toMatch(/solo|únicamente|no inventes/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- ai-narrative`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai-narrative.ts`:
```ts
import "server-only";
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

// In-memory narrative cache (per server instance) keyed by day+coords+crop.
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
    return null; // route falls back to the rule-based recommendation
  }
}
```

> If `npm run build` errors on `maxOutputTokens`, the installed `ai` version uses the older `maxTokens` — rename it. If the model id is rejected, try the alias `anthropic("claude-haiku-4-5")`. Install `server-only` if not present (`npm i server-only`) or drop that import line (it's a guard, not required).

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- ai-narrative`
Expected: PASS (2 tests — they exercise only `buildNarrativePrompt`, no network/LLM).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-narrative.ts src/lib/ai-narrative.test.ts
git commit -m "feat: grounded Claude narrative builder + cached generateNarrative with fallback"
```

---

## Task 5: /api/pronostico route handler

**Files:**
- Create: `src/app/api/pronostico/route.ts`

No unit test — verified by running the server and curling.

- [ ] **Step 1: Implement the route**

Create `src/app/api/pronostico/route.ts`:
```ts
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

    // LLM narrative with an 8s timeout; fall back to the rule-based text.
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
  } catch (e) {
    return Response.json({ error: "No se pudo obtener el pronóstico" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Build sanity**

Run: `npm run build`
Expected: clean; the route appends to the routes list (it will be dynamic, `ƒ /api/pronostico`).

- [ ] **Step 3: Manual verify (controller will also check)**

With a `.env.local` containing `ANTHROPIC_API_KEY`, run `npm run dev`, then in another shell:
```bash
curl "http://localhost:3000/api/pronostico?lat=-27.82&lon=-66.78&crop=olivo&ndvi=0.5"
```
Expected: JSON with `dias` (7 entries), `riesgos` (0+), `recomendacion` (string), `fuenteIA` (true if key present & LLM ok, else false), `actualizado`. Without a key, `fuenteIA` is `false` and `recomendacion` is the rule-based text — still a valid 200.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pronostico/route.ts
git commit -m "feat: /api/pronostico route — forecast + risks + AI narrative with rule fallback"
```

---

## Task 6: ForecastPanel component

**Files:**
- Create: `src/components/forecast-panel.tsx`

Verified via preview.

- [ ] **Step 1: Implement**

Create `src/components/forecast-panel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

type Dia = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number };
type Riesgo = { tipo: "helada" | "deficit_hidrico" | "calor"; nivel: "bajo" | "medio" | "alto"; dia: string; detalle: string };
type Pronostico = { dias: Dia[]; riesgos: Riesgo[]; recomendacion: string; fuenteIA: boolean; actualizado: string };

const RIESGO_LABEL: Record<Riesgo["tipo"], string> = {
  helada: "Helada",
  deficit_hidrico: "Déficit hídrico",
  calor: "Calor",
};
const NIVEL_CLASS: Record<Riesgo["nivel"], string> = {
  bajo: "bg-yellow-100 text-yellow-800",
  medio: "bg-orange-100 text-orange-800",
  alto: "bg-red-100 text-red-800",
};

function diaCorto(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short" });
}

export default function ForecastPanel({ lat, lon, ndvi, crop = "olivo" }: { lat: number; lon: number; ndvi: number; crop?: "olivo" | "vid" }) {
  const [data, setData] = useState<Pronostico | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setEstado("loading");
    fetch(`/api/pronostico?lat=${lat}&lon=${lon}&ndvi=${ndvi}&crop=${crop}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Pronostico) => { setData(j); setEstado("ok"); })
      .catch(() => setEstado("error"));
  }, [lat, lon, ndvi, crop]);

  if (estado === "loading") return <div className="rounded border p-3 text-sm text-gray-500">Cargando pronóstico…</div>;
  if (estado === "error" || !data) return <div className="rounded border p-3 text-sm text-gray-500">Pronóstico no disponible ahora.</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-emerald-900">Pronóstico 7 días</h3>
      <div className="flex gap-1 overflow-x-auto">
        {data.dias.map((d) => (
          <div key={d.fecha} className="flex min-w-12 flex-col items-center rounded bg-gray-50 px-2 py-1 text-center">
            <span className="text-[11px] font-medium capitalize text-gray-600">{diaCorto(d.fecha)}</span>
            <span className="text-xs font-semibold">{Math.round(d.tmax)}°</span>
            <span className="text-[11px] text-gray-500">{Math.round(d.tmin)}°</span>
            <span className="text-[10px] text-sky-600">{d.lluvia > 0 ? `${d.lluvia}mm` : "—"}</span>
          </div>
        ))}
      </div>
      {data.riesgos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.riesgos.map((r, i) => (
            <span key={i} className={`rounded px-2 py-0.5 text-[11px] font-medium ${NIVEL_CLASS[r.nivel]}`} title={r.detalle}>
              {RIESGO_LABEL[r.tipo]} · {r.nivel}
            </span>
          ))}
        </div>
      )}
      <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">{data.recomendacion}</p>
      <p className="text-[10px] text-gray-400">
        Clima: Open-Meteo · {data.fuenteIA ? "análisis: IA" : "recomendación automática"} · actualizado{" "}
        {new Date(data.actualizado).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build sanity**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/forecast-panel.tsx
git commit -m "feat: ForecastPanel — 7-day chips, risk badges, recommendation, source footer"
```

---

## Task 7: Wire ForecastPanel into the Productor view

**Files:**
- Modify: `src/components/producer-view.tsx`

Verified via preview (controller).

- [ ] **Step 1: Mount the panel with the finca centroid**

In `src/components/producer-view.tsx`: the producer view centers on `[-66.77, -27.83]` (the real Arauco grove). Import `ForecastPanel` and render it in the sidebar (below the irrigation hint), passing the finca centroid and the current NDVI (the last value of `serie`, falling back to 0.5):
```tsx
import ForecastPanel from "@/components/forecast-panel";
// ...inside the <aside>, after the irrigationHint <p>:
<ForecastPanel lat={-27.823} lon={-66.785} ndvi={serie.at(-1) ?? 0.5} crop="olivo" />
```
(Use the same finca-aimogasta-1 centroid the map uses: lon −66.785, lat −27.823.)

- [ ] **Step 2: Build sanity**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/producer-view.tsx
git commit -m "feat: mount ForecastPanel in Vista Productor (mi finca)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass (existing 19 + agroclimate + open-meteo + ai-narrative).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean; `/api/pronostico` listed as a dynamic route.

- [ ] **Step 3: Manual end-to-end (with `.env.local` key)**

`npm run dev` → open `/panel` → switch to **Productor** → confirm the "Pronóstico 7 días" panel shows chips, any risk badges, a recommendation, and the source footer. With the key set, footer says "análisis: IA"; without it, "recomendación automática" (still works).

---

## Self-Review

**1. Spec coverage:**
- §2 principle (núcleo ao vivo, IA narra, fallback) → Task 5 (Promise.race timeout + `recomendacion: narrativa ?? reglaRec`, `fuenteIA`), Task 4 (cache + null on failure). ✓
- §3 three risks (helada/déficit/calor) → Task 2 (`frostRisk`/`waterDeficitRisk`/`heatRisk`), wired in Task 5. ✓
- §4 architecture/files (open-meteo, agroclimate, ai-narrative, route, forecast-panel, producer-view wire; deps `ai`+`@ai-sdk/anthropic`) → Tasks 1,3,2,4,5,6,7. ✓
- §4 secrets (server-only env, never committed) → Task 1 (.env.example, .env.local ignored), Task 4 (reads process.env server-side, `server-only`). ✓
- §5 UI (chips, risk badges, recommendation, source/updated footer) → Task 6. ✓
- §6 testing (TDD agroclimate; open-meteo parser test; route/IA manual) → Tasks 2,3,4 tests; Tasks 5,8 manual. ✓
- §7 out of scope respected (no gov per-dept, no auth, no history). ✓

**2. Placeholder scan:** The `frostRisk` scaffold contains a deliberately-flagged dead `worst` line with an explicit instruction to remove it (Steps 3–4) — not a silent placeholder. The Task 5 `catch (e)` binds `e` unused; if lint complains, change to `catch {`. No "TBD"/"add error handling" hand-waves.

**3. Type consistency:** `DiaForecast`/`Forecast` defined in `open-meteo.ts` and re-stated structurally in `forecast-panel.tsx` (client copy — acceptable, no server import in client). `Crop`/`Riesgo`/`Nivel`/`RiesgoTipo` defined in `agroclimate.ts` and imported by `ai-narrative.ts` and `route.ts`. `PronosticoResponse` shape returned by Task 5 matches what Task 6 consumes (`dias`/`riesgos`/`recomendacion`/`fuenteIA`/`actualizado`). `generateNarrative(f, riesgos, crop, cacheKey)` signature matches the Task 5 call. Consistent.

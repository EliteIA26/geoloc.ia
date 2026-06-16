# Panel Editorial + Cérebro Climático — Implementation Plan (Incremento 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the panel from a descriptive number-grid into an insight-first, editorial product that ingests ~9 real signals (mostly free from Open-Meteo) and presents them digested, with an AI "resumen de gestión" for government and a forecast recommendation for the producer.

**Architecture:** Extend the existing data libs and the offline Sentinel-2 pipeline; add a territorial AI synthesis route; redesign both views (Gestión + Productor) in an editorial, insight-first language. Pure signal logic stays in tested functions; live weather comes from Open-Meteo (no key); the AI only narrates grounded data with a rule-based fallback.

**Tech Stack:** Next 16 Route Handlers, Open-Meteo (free), AI SDK (`ai` + `@ai-sdk/anthropic`, Claude Haiku), Zod, Tailwind 4, Vitest. Offline: Python (rasterio/numpy) for NDMI.

---

## Open-Meteo field facts (confirmed against current docs — use verbatim)
- Daily: `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `et0_fao_evapotranspiration`, `wind_speed_10m_max`, `wind_gusts_10m_max`.
- Hourly only (must aggregate to daily): `relative_humidity_2m`, `soil_moisture_3_to_9cm`.
- Past data: add `past_days=30` (daily arrays then contain 30 past days + 7 forecast; the LAST 7 entries are the forecast).
- `timezone=auto`, no API key.

## Shared types (keep identical across tasks)
```ts
// open-meteo.ts
export type DiaForecast = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number; vientoMax: number; humedadMin: number };
export type Forecast = { dias: DiaForecast[]; sueloFrac: number; lluviaPrev30: number };
// agroclimate.ts (existing + new)
export type Crop = "olivo" | "vid";
export type RiesgoTipo = "helada" | "deficit_hidrico" | "calor" | "incendio" | "sequia";
export type Nivel = "bajo" | "medio" | "alto";
export type Riesgo = { tipo: RiesgoTipo; nivel: Nivel; dia: string; detalle: string };
export type Senal = { clave: string; etiqueta: string; valor: string; nivel: "ok" | "atencion" | "alerta" | "neutro" };
```

---

## Task 1: Extend `open-meteo.ts` — richer fetch + hourly→daily aggregation (TDD the pure parts)

**Files:** Modify `src/lib/open-meteo.ts`; Modify `src/lib/open-meteo.test.ts`

- [ ] **Step 1: Write failing tests for the new pure helpers**

Append to `src/lib/open-meteo.test.ts`:
```ts
import { dailyMinHumidity, parseForecast } from "./open-meteo";

describe("dailyMinHumidity", () => {
  it("reduces hourly humidity to the per-day minimum", () => {
    const times = ["2026-06-16T00:00", "2026-06-16T12:00", "2026-06-17T00:00"];
    const vals = [40, 22, 55];
    expect(dailyMinHumidity(times, vals, ["2026-06-16", "2026-06-17"])).toEqual([22, 55]);
  });
});

describe("parseForecast (rich)", () => {
  const raw = {
    daily: {
      time: ["2026-06-15", "2026-06-16", "2026-06-17"],
      temperature_2m_max: [20, 22, 24],
      temperature_2m_min: [5, 6, -1],
      precipitation_sum: [3, 0, 0],
      et0_fao_evapotranspiration: [2, 4, 5],
      wind_speed_10m_max: [10, 30, 15],
      wind_gusts_10m_max: [18, 50, 22],
    },
    hourly: {
      time: ["2026-06-16T06:00", "2026-06-16T15:00", "2026-06-17T06:00"],
      relative_humidity_2m: [60, 20, 70],
      soil_moisture_3_to_9cm: [0.18, 0.18, 0.2],
    },
  };
  it("takes the LAST 2 daily entries as the forecast and sums past rain", () => {
    const f = parseForecast(raw, 2);
    expect(f.dias).toHaveLength(2);
    expect(f.dias[0]).toMatchObject({ fecha: "2026-06-16", tmin: 6, tmax: 22, vientoMax: 30, humedadMin: 20 });
    expect(f.lluviaPrev30).toBe(3); // the one past day before the last 2
    expect(f.sueloFrac).toBeCloseTo(0.187, 2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- open-meteo`
Expected: FAIL (`dailyMinHumidity` / new parse signature not defined).

- [ ] **Step 3: Implement**

Replace `src/lib/open-meteo.ts` with:
```ts
import { z } from "zod";

export type DiaForecast = { fecha: string; tmin: number; tmax: number; lluvia: number; et0: number; vientoMax: number; humedadMin: number };
export type Forecast = { dias: DiaForecast[]; sueloFrac: number; lluviaPrev30: number };

const Schema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    et0_fao_evapotranspiration: z.array(z.number()),
    wind_speed_10m_max: z.array(z.number()),
    wind_gusts_10m_max: z.array(z.number()),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    relative_humidity_2m: z.array(z.number()),
    soil_moisture_3_to_9cm: z.array(z.number()),
  }),
});

export function dailyMinHumidity(hourTimes: string[], hum: number[], fechas: string[]): number[] {
  return fechas.map((f) => {
    const vals = hourTimes.map((t, i) => (t.startsWith(f) ? hum[i] : NaN)).filter((v) => !Number.isNaN(v));
    return vals.length ? Math.min(...vals) : 50;
  });
}

export function parseForecast(raw: unknown, forecastDays = 7): Forecast {
  const p = Schema.parse(raw);
  const d = p.daily;
  const n = d.time.length;
  const start = Math.max(0, n - forecastDays);
  const fechasFut = d.time.slice(start);
  const humMin = dailyMinHumidity(p.hourly.time, p.hourly.relative_humidity_2m, fechasFut);
  const dias: DiaForecast[] = fechasFut.map((fecha, k) => {
    const i = start + k;
    return {
      fecha,
      tmin: d.temperature_2m_min[i],
      tmax: d.temperature_2m_max[i],
      lluvia: d.precipitation_sum[i],
      et0: d.et0_fao_evapotranspiration[i],
      vientoMax: d.wind_speed_10m_max[i],
      humedadMin: humMin[k],
    };
  });
  const lluviaPrev30 = d.precipitation_sum.slice(0, start).reduce((a, b) => a + b, 0);
  const soil = p.hourly.soil_moisture_3_to_9cm;
  const sueloFrac = soil.length ? soil.reduce((a, b) => a + b, 0) / soil.length : 0.2;
  return { dias, sueloFrac, lluviaPrev30 };
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max,wind_gusts_10m_max` +
    `&hourly=relative_humidity_2m,soil_moisture_3_to_9cm` +
    `&past_days=30&forecast_days=7&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 10800 } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json(), 7);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- open-meteo`
Expected: PASS. (Note: existing tests that called `parseForecast(sample)` with the OLD shape will now fail — update those old tests to the new rich payload shape, or delete the two superseded ones, keeping behavior covered by the new tests.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/open-meteo.ts src/lib/open-meteo.test.ts
git commit -m "feat: enrich Open-Meteo fetch (wind, humidity, soil, past rain) + aggregation, TDD"
```

---

## Task 2: New agroclimate signals (TDD)

**Files:** Modify `src/lib/agroclimate.ts`; Modify `src/lib/agroclimate.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/agroclimate.test.ts`:
```ts
import { fireRisk, soilMoistureStatus, growingDegreeDays, applicationWindow, rainDeficit } from "./agroclimate";

const fechas = ["2026-06-16", "2026-06-17", "2026-06-18"];

describe("fireRisk", () => {
  it("null when not hot/dry/windy", () => {
    expect(fireRisk([20, 22, 21], [10, 12, 11], [55, 60, 58], 30)).toBeNull();
  });
  it("alto when hot + windy + dry + low recent rain", () => {
    const r = fireRisk([34, 36, 33], [35, 40, 30], [18, 15, 20], 1);
    expect(r?.tipo).toBe("incendio");
    expect(r?.nivel).toBe("alto");
  });
});

describe("soilMoistureStatus", () => {
  it("alerta when very dry soil", () => { expect(soilMoistureStatus(0.08).nivel).toBe("alerta"); });
  it("ok when moist soil", () => { expect(soilMoistureStatus(0.30).nivel).toBe("ok"); });
});

describe("growingDegreeDays", () => {
  it("accumulates degree-days above the base", () => {
    // ((10+20)/2 - 10) + ((12+22)/2 -10) = 5 + 7 = 12
    expect(growingDegreeDays([10, 12], [20, 22], 10).gdd).toBe(12);
  });
});

describe("applicationWindow", () => {
  it("lists low-wind days as good for spraying/irrigation", () => {
    expect(applicationWindow([8, 28, 12], fechas)).toEqual(["2026-06-16", "2026-06-18"]);
  });
});

describe("rainDeficit", () => {
  it("alerta when far below normal", () => {
    expect(rainDeficit(2, 40).nivel).toBe("alerta");
  });
  it("ok when near normal", () => {
    expect(rainDeficit(38, 40).nivel).toBe("ok");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- agroclimate`
Expected: FAIL (new functions undefined).

- [ ] **Step 3: Implement (append to `src/lib/agroclimate.ts`)**

```ts
export type Senal = { clave: string; etiqueta: string; valor: string; nivel: "ok" | "atencion" | "alerta" | "neutro" };

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
```

> Note: `fireRisk` returns `dia` as `"día N"` to stay pure (no date array needed). If you prefer real dates, pass `fechas` and index it — but keep the tests green. Keep `Riesgo`/`Nivel` imports consistent with the existing file (they're already declared there).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- agroclimate`
Expected: PASS (existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agroclimate.ts src/lib/agroclimate.test.ts
git commit -m "feat: agroclimate signals — fire, soil moisture, GDD, application window, rain deficit (TDD)"
```

---

## Task 3: Extend AI narrative (rich producer prompt + territorial resumen)

**Files:** Modify `src/lib/ai-narrative.ts`; Modify `src/lib/ai-narrative.test.ts`

- [ ] **Step 1: Write failing tests (prompt builders are pure)**

Append to `src/lib/ai-narrative.test.ts`:
```ts
import { buildTerritorialPrompt } from "./ai-narrative";

describe("buildTerritorialPrompt", () => {
  it("embeds per-department risk summary and instructs grounding", () => {
    const p = buildTerritorialPrompt([
      { nombre: "Arauco", riesgos: ["sequia"] },
      { nombre: "Famatina", riesgos: ["helada"] },
    ]);
    expect(p).toContain("Arauco");
    expect(p).toContain("Famatina");
    expect(p).toMatch(/solo|únicamente|no inventes/i);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- ai-narrative`
Expected: FAIL (`buildTerritorialPrompt` undefined).

- [ ] **Step 3: Implement (append to `src/lib/ai-narrative.ts`)**

```ts
const SYSTEM_GOV =
  "Sos asesor territorial para el gobierno de La Rioja, Argentina. Español rioplatense, claro y breve (2-3 frases). " +
  "Usá ÚNICAMENTE los datos que te paso (no inventes). Decí qué priorizar esta semana y dónde, en lenguaje que un funcionario no técnico entienda.";

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
    const out = text.trim();
    if (out) cache.set(cacheKey, out);
    return out || null;
  } catch {
    return null;
  }
}
```

> `cache`, `generateText`, `anthropic` are already imported/declared at the top of the file from the earlier feature — reuse them; do not redeclare.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- ai-narrative`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-narrative.ts src/lib/ai-narrative.test.ts
git commit -m "feat: territorial resumen prompt + generateTerritorialResumen (cached, fallback)"
```

---

## Task 4: Department centroids constant

**Files:** Create `src/lib/departamento-centroids.ts`; Test `src/lib/departamento-centroids.test.ts`

- [ ] **Step 1: Compute centroids once**

Run a one-off node script (do NOT commit the script) to read `public/data/departamentos.geojson` and print, for each feature, `{ nombre, lat, lon }` using the average of the outer-ring coordinates (good enough for a forecast point). Example:
```bash
node -e "const fs=require('fs');const gj=JSON.parse(fs.readFileSync('public/data/departamentos.geojson','utf8'));for(const f of gj.features){const r=f.geometry.coordinates.flat(Infinity);let x=0,y=0,n=0;for(let i=0;i<r.length;i+=2){x+=r[i];y+=r[i+1];n++;}console.log(JSON.stringify({nombre:f.properties.nombre,lon:+(x/n).toFixed(3),lat:+(y/n).toFixed(3)})+',');}"
```

- [ ] **Step 2: Write the test**

Create `src/lib/departamento-centroids.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CENTROIDES } from "./departamento-centroids";

describe("CENTROIDES", () => {
  it("has 18 La Rioja departments with plausible coords", () => {
    expect(CENTROIDES).toHaveLength(18);
    for (const c of CENTROIDES) {
      expect(c.lon).toBeGreaterThan(-70);
      expect(c.lon).toBeLessThan(-65);
      expect(c.lat).toBeGreaterThan(-32);
      expect(c.lat).toBeLessThan(-27);
    }
    expect(CENTROIDES.some((c) => c.nombre === "Arauco")).toBe(true);
  });
});
```

- [ ] **Step 3: Implement**

Create `src/lib/departamento-centroids.ts` pasting the 18 lines from Step 1:
```ts
export type Centroide = { nombre: string; lat: number; lon: number };
export const CENTROIDES: Centroide[] = [
  // paste the 18 { nombre, lat, lon } objects produced in Step 1
];
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- departamento-centroids`
Expected: PASS (18 entries, coords in range).

- [ ] **Step 5: Commit**

```bash
git add src/lib/departamento-centroids.ts src/lib/departamento-centroids.test.ts
git commit -m "feat: precomputed centroids for the 18 La Rioja departments"
```

---

## Task 5: Extend `/api/pronostico` with the rich signals

**Files:** Modify `src/app/api/pronostico/route.ts`

- [ ] **Step 1: Implement**

Update the route so, after computing `riesgos`, it also builds the rich signal list and includes the new forecast fields. Replace the body's risk/return section with:
```ts
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
      generateNarrative(f as unknown as Parameters<typeof generateNarrative>[0], riesgos, crop, cacheKey),
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
```
> `generateNarrative` currently types its first arg as the old `Forecast`. Since the new `Forecast` is a superset (adds fields), update `ai-narrative.ts`'s `buildNarrativePrompt`/`generateNarrative` to import `Forecast` from `open-meteo.ts` (it already does) — the extra fields are ignored by the prompt builder, so no cast is needed once both reference the same `Forecast` type. Remove the `as unknown as` if types line up; keep the build clean.

- [ ] **Step 2: Build + manual verify**

Run `npm run build` (clean). Then `npm run dev` and:
```bash
curl "http://localhost:3000/api/pronostico?lat=-27.823&lon=-66.785&crop=olivo&ndvi=0.5"
```
Expected: JSON now includes `senales` (suelo, déficit, gdd) and `ventana`, plus the existing fields. 200 even without a key (fuenteIA:false).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pronostico/route.ts src/lib/ai-narrative.ts
git commit -m "feat: /api/pronostico returns rich signals (soil, deficit, gdd, window, fire)"
```

---

## Task 6: New `/api/resumen-territorial` route

**Files:** Create `src/app/api/resumen-territorial/route.ts`

- [ ] **Step 1: Implement**

```ts
import { fetchForecast } from "@/lib/open-meteo";
import { frostRisk, heatRisk, waterDeficitRisk, fireRisk, ruleBasedRecommendation, type Riesgo } from "@/lib/agroclimate";
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
```

- [ ] **Step 2: Build + manual verify**

`npm run build` clean. `npm run dev`, then `curl "http://localhost:3000/api/resumen-territorial"` → JSON with `resumen` (rule-based without key), `deptosEnRiesgo`, `actualizado`. May take a few seconds (18 cached fetches).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/resumen-territorial/route.ts
git commit -m "feat: /api/resumen-territorial — per-department risk + AI gov resumen with fallback"
```

---

## Task 7: NDMI in the offline pipeline

**Files:** Modify `scripts/ndvi_snapshot.py`; regenerate `public/data/series-ndvi.json` (add an `ndmi` value)

- [ ] **Step 1: Add NDMI computation**

In `scripts/ndvi_snapshot.py`, after NDVI, compute NDMI = (B08 − B11) / (B08 + B11) over the same Aimogasta scene (B11 is 20m — resample/align to B08 grid; rasterio `reproject` or read B11 with the same window/scale). Print the grove-core mean NDMI. Add it to the JSON written for the finca, e.g. a new key in `series-ndvi.json`:
```json
{ "finca-aimogasta-1": [...], "arauco": [...], "ndmi-aimogasta": 0.18 }
```
(Use the real computed value; document it like the NDVI provenance.)

- [ ] **Step 2: Run + verify**

```bash
. .venv/Scripts/activate && python scripts/ndvi_snapshot.py
```
Expected: prints a real NDMI mean (roughly 0.05–0.35 for irrigated groves vs near-0/negative for bare desert); `series-ndvi.json` updated.

- [ ] **Step 3: Commit**

```bash
git add scripts/ndvi_snapshot.py public/data/series-ndvi.json
git commit -m "feat: compute real NDMI (vegetation moisture) over Aimogasta scene"
```

---

## Task 8: Editorial design tokens + base classes

**Files:** Modify `src/app/globals.css`

- [ ] **Step 1: Add editorial tokens (Tailwind 4 layer)**

The app uses Tailwind 4. Add a small set of editorial utilities/variables in `globals.css` for the new look — a warm neutral page surface, hairline borders, and a refined accent — used by the new components:
```css
:root {
  --bg-page: #faf9f6;
  --bg-card: #ffffff;
  --hairline: rgba(40, 38, 34, 0.10);
  --ink: #1c1b19;
  --ink-soft: #57534e;
  --ink-faint: #8a857d;
  --accent: #1f5e44;
}
.ed-page { background: var(--bg-page); color: var(--ink); }
.ed-card { background: var(--bg-card); border: 0.5px solid var(--hairline); border-radius: 16px; }
.ed-soft { color: var(--ink-soft); }
.ed-faint { color: var(--ink-faint); }
```
(Keep existing styles; these are additive. Dark mode is out of scope for this demo — the panel is presented light.)

- [ ] **Step 2: Build sanity**

Run: `npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: editorial design tokens (warm neutral, hairline, accent)"
```

---

## Task 9: `InsightHero` + `SignalGrid` components

**Files:** Create `src/components/insight-hero.tsx`, `src/components/signal-grid.tsx`

- [ ] **Step 1: InsightHero**

Create `src/components/insight-hero.tsx`:
```tsx
"use client";

export type HeroChip = { label: string; tone: "alerta" | "atencion" | "ok" | "info" };

const TONE: Record<HeroChip["tone"], string> = {
  alerta: "bg-red-50 text-red-800",
  atencion: "bg-amber-50 text-amber-800",
  ok: "bg-emerald-50 text-emerald-800",
  info: "bg-sky-50 text-sky-800",
};

export default function InsightHero({
  eyebrow, titulo, chips, accion, footer,
}: { eyebrow: string; titulo: string; chips: HeroChip[]; accion?: string; footer?: string }) {
  return (
    <div className="ed-card p-5">
      <div className="mb-2.5 text-xs ed-faint">{eyebrow}</div>
      <p className="m-0 text-[20px] leading-relaxed text-[var(--ink)]">{titulo}</p>
      {chips.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className={`rounded-full px-3 py-1 text-[13px] ${TONE[c.tone]}`}>{c.label}</span>
          ))}
        </div>
      )}
      {accion && (
        <p className="mt-3.5 border-t border-[var(--hairline)] pt-3 text-sm ed-soft">{accion}</p>
      )}
      {footer && <p className="mt-2 text-[11px] ed-faint">{footer}</p>}
    </div>
  );
}
```

- [ ] **Step 2: SignalGrid**

Create `src/components/signal-grid.tsx`:
```tsx
"use client";

export type Signal = { etiqueta: string; valor: string; nivel: "ok" | "atencion" | "alerta" | "neutro" };

const DOT: Record<Signal["nivel"], string> = {
  ok: "bg-emerald-500", atencion: "bg-amber-500", alerta: "bg-red-500", neutro: "bg-stone-300",
};

export default function SignalGrid({ signals }: { signals: Signal[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {signals.map((s, i) => (
        <div key={i} className="ed-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] ed-faint">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.nivel]}`} />{s.etiqueta}
          </div>
          <div className="mt-1 text-[15px] text-[var(--ink)]">{s.valor}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build sanity**

Run: `npm run build` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/insight-hero.tsx src/components/signal-grid.tsx
git commit -m "feat: InsightHero + SignalGrid editorial components"
```

---

## Task 10: Editorial restyle of Vista Gestión + territorial resumen

**Files:** Modify `src/app/panel/page.tsx`, `src/components/department-detail.tsx`, `src/components/aggregate-indicators.tsx`

Verified via preview (controller).

- [ ] **Step 1: Fetch + mount the territorial resumen hero**

In `panel/page.tsx`, add state `resumen: { resumen: string; fuenteIA: boolean; deptosEnRiesgo: {nombre:string;riesgos:string[]}[]; actualizado: string } | null`, fetch `/api/resumen-territorial` on mount (Gestión only). Render `<InsightHero>` at the top of the Gestión sidebar (above the department list) with:
- `eyebrow="Resumen de gestión · IA · " + fecha`
- `titulo={resumen.resumen}`
- `chips` derived: one `alerta` chip per risk type present across `deptosEnRiesgo` (e.g. "Sequía en 3 deptos", "Helada en 2"), built by counting `deptosEnRiesgo[].riesgos`.
- `footer` = "Clima: Open-Meteo · " + (fuenteIA ? "análisis: IA" : "resumen automático") + " · actualizado " + hora.
Apply the `ed-page`/`ed-card` editorial classes to the layout; soften the emerald header to the editorial palette (lighter bar, `--ink` title, accent mark) per the approved mockup.

- [ ] **Step 2: Digest the department detail + list (plain language, index secondary)**

In `department-detail.tsx` and `aggregate-indicators.tsx`, lead each item with a plain-language status sentence derived from `vegetationStatus(ndvi)` (e.g. "Vegetación moderada y estable", "Vegetación escasa — sequía sostenida") and demote the raw `NDVI x.xx` to a small muted secondary line (`ed-faint`), keeping the provenance pill. Use the editorial card classes. Keep the click-to-select behavior intact.

- [ ] **Step 3: Verify via preview (controller) + build**

`npm run build` clean. Controller will screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/app/panel/page.tsx src/components/department-detail.tsx src/components/aggregate-indicators.tsx
git commit -m "feat: editorial Gestión — territorial resumen hero + digested department language"
```

---

## Task 11: Editorial restyle of Vista Productor + rich signals

**Files:** Modify `src/components/producer-view.tsx`, `src/components/forecast-panel.tsx`

Verified via preview.

- [ ] **Step 1: Producer hero + signals**

In `producer-view.tsx`, render `<InsightHero>` at the top of the finca sidebar using the `/api/pronostico` `recomendacion` as `titulo`, the active risks as chips, and the source footer. Below it, render `<SignalGrid>` with the `senales` (soil moisture, rain deficit, GDD) plus NDMI (read `ndmi-aimogasta` from `series-ndvi.json`) as an extra signal ("Humedad vegetación (NDMI)"). Apply editorial classes.

- [ ] **Step 2: Editorial forecast panel**

Restyle `forecast-panel.tsx` to the editorial look (use `ed-card`, refined chips, the new risk-badge tones, source footer). It already fetches `/api/pronostico`; now also surface `ventana` ("Buenos días para regar/aplicar: …") when present. Keep loading/error states.

- [ ] **Step 3: Verify via preview (controller) + build**

`npm run build` clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/producer-view.tsx src/components/forecast-panel.tsx
git commit -m "feat: editorial Productor — insight hero + signal grid (NDMI, soil, gdd) + application window"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full suite**

Run: `npm test` → all pass (existing + new open-meteo, agroclimate, ai-narrative, centroids).

- [ ] **Step 2: Build**

Run: `npm run build` → clean; routes list shows `ƒ /api/pronostico` and `ƒ /api/resumen-territorial`.

- [ ] **Step 3: End-to-end (controller, with key)**

`npm run dev` → `/panel`: Gestión opens with the territorial resumen hero + digested departments; Productor opens with the finca insight + signal grid (soil, deficit, gdd, NDMI) + editorial forecast. Curl both routes; confirm 200 + rich JSON. Screenshot both views.

---

## Self-Review

**1. Spec coverage:**
- §3 signals: NDVI (existing) + NDMI (Task 7) + balance/soil/deficit (Tasks 1,2,5) + clima/viento/ventana (Tasks 1,2,5) + helada/calor/incendio/sequía/GDD (Task 2,5) → covered. ✓
- §4 architecture: open-meteo (T1), agroclimate (T2), ai-narrative territorial (T3), centroids (T4), /api/pronostico (T5), /api/resumen-territorial (T6), NDMI pipeline (T7), editorial tokens+components (T8,T9), Gestión+Productor restyle (T10,T11). ✓
- §1 insight-first both views: InsightHero in Gestión (T10) + Productor (T11). ✓
- §5 honesty: 18 cached calls (T6), demo thresholds (T2 comment), NDVI referencia preserved (T10 keeps provenance), key server-side (T5/T6 read process.env, no client import). ✓
- §6 testing: TDD on all new pure functions (T1,T2,T3,T4); routes/UI via preview (T5,T6,T10,T11,T12). ✓

**2. Placeholder scan:** Task 4 requires pasting the 18 computed centroids (a concrete one-off command is given, not a vague "add centroids"). Task 7 NDMI value is the real computed output. No "TBD"/"handle edge cases". The `fireRisk` `"día N"` simplification is explicitly noted, not hidden.

**3. Type consistency:** `Forecast` (T1) is a superset consumed by `/api/pronostico` (T5) and `/api/resumen-territorial` (T6); `generateNarrative` reference reconciled in T5 note. `Senal` (T2) flows to `senales` in T5 and `SignalGrid.Signal` (T9) — note: `Senal.nivel` ("ok"|"atencion"|"alerta"|"neutro") matches `SignalGrid` `Signal.nivel` exactly. `Riesgo`/`Nivel`/`RiesgoTipo` extended in T2 match usages in T5/T6. `CENTROIDES` (T4) consumed by T6. `buildTerritorialPrompt`/`generateTerritorialResumen` (T3) consumed by T6. Consistent.

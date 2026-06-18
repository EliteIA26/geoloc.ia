# F0 Territorial — Briefing 3D de Vinchina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a presentable B2G demo at `/bermejo` — a 3D map of the Valle del Bermejo focused on Vinchina plus a "briefing" panel (contexto Censo 2022 → satélite/área ativa observada → corredor Chile), every indicator carrying a fonte·data·confiança badge, framed as territorial intelligence feeding the **Plan de Desarrollo Productivo** (related to the 2015 POT, which provides the base territorial diagnosis — Federico: "está relacionado, pero el nuestro es un plan de desarrollo productivo").

**Architecture:** New client route `/bermejo` reusing the existing MapLibre `MapShell` + premium styling. A new `src/lib/territorial.ts` (Zod schemas + loaders + pure formatters) feeds the UI from static curated JSON (Censo 2022 + CEP XXI) + GeoJSON layers (existing IGN-derived department boundaries, Argentina Georef locality centroids, and DNV RN76 geometry) + a Sentinel-2 raster/estimate produced by a new Python pipeline on the existing Action.

**Tech Stack:** Next 16 (App Router, client component), React 19, TypeScript strict, Zod v4, Tailwind 4, MapLibre GL v5, Vitest; Python (rasterio + pystac-client + planetary-computer) for the satellite pipeline.

**Honesty rules (non-negotiable, from the spec):** satellite = "vegetação ativa observada" (cultivo OU natural), never "X ha de [cultivo]"; estimates always as a range + confidence; Chile corridor status "incipiente"; Censo/CEP are dated static snapshots. Every indicator shows fonte·data·confiança.

---

## File Structure

- Create `src/lib/territorial.ts` — `Confianza`, `Indicador`, `Territorial`, `VinchinaSatelital` Zod schemas + types; `fetchTerritorial()`, `fetchVinchinaSatelital()`; pure helpers `areaBand()`, `formatAreaRange()`.
- Create `src/lib/territorial.test.ts` — unit tests (TDD).
- Create `public/data/territorial-vinchina.json` — curated official indicators (Censo 2022 + CEP XXI) with fonte/fecha/confianza.
- Create `public/data/bermejo-deptos.geojson` — the 3 deptos (derived from existing `departamentos.geojson`).
- Create `public/data/vinchina-localidades.geojson` — Vinchina, Jagüé (points).
- Create `public/data/corredor-pircas-negras.geojson` — Vinchina → Paso Pircas Negras line.
- Create `scripts/vinchina_ndvi.py` — Sentinel-2 NDVI snapshot + active-area estimate (reuses `s2_common`).
- Modify `.github/workflows/satelital.yml` — add `python scripts/vinchina_ndvi.py` to the run step.
- Create `src/components/territorial/source-badge.tsx` — fonte·data·confiança chip.
- Create `src/components/territorial/indicator-card.tsx` — one indicator row + SourceBadge.
- Create `src/components/territorial/briefing-chapter.tsx` — titled chapter wrapping IndicatorCards.
- Create `src/app/bermejo/page.tsx` — the route (map + briefing aside).

---

## Task 1: `territorial.ts` lib (schemas, loaders, pure helpers) — TDD

**Files:**
- Create: `src/lib/territorial.ts`
- Test: `src/lib/territorial.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/territorial.test.ts
import { describe, it, expect } from "vitest";
import {
  TerritorialSchema,
  VinchinaSatelitalSchema,
  areaBand,
  formatAreaRange,
} from "./territorial";

describe("TerritorialSchema", () => {
  it("parses a valid territorial briefing", () => {
    const v = TerritorialSchema.parse({
      depto: "Vinchina",
      contexto: [
        { etiqueta: "Población 2022", valor: "2.500", fonte: "INDEC Censo 2022", fecha: "2022", confianza: "oficial" },
      ],
      satelite: [],
      chile: [
        { etiqueta: "Paso Pircas Negras", valor: "incipiente", fonte: "POT 2015", fecha: "2015", confianza: "oficial", nota: "RN76" },
      ],
    });
    expect(v.depto).toBe("Vinchina");
    expect(v.contexto[0].confianza).toBe("oficial");
  });

  it("rejects an invalid confianza", () => {
    expect(() =>
      TerritorialSchema.parse({
        depto: "Vinchina",
        contexto: [{ etiqueta: "x", valor: "1", fonte: "y", fecha: "2022", confianza: "magico" }],
        satelite: [],
        chile: [],
      }),
    ).toThrow();
  });
});

describe("VinchinaSatelitalSchema", () => {
  it("parses the satellite estimate", () => {
    const v = VinchinaSatelitalSchema.parse({
      fecha: "2026-05-24",
      haActivaMin: 1240,
      haActivaMax: 1360,
      ndviMedio: 0.32,
    });
    expect(v.haActivaMax).toBe(1360);
  });
});

describe("areaBand", () => {
  it("builds a ±10% band by default", () => {
    expect(areaBand(1000)).toEqual({ min: 900, max: 1100 });
  });
  it("respects a custom relative margin", () => {
    expect(areaBand(1000, 0.2)).toEqual({ min: 800, max: 1200 });
  });
});

describe("formatAreaRange", () => {
  it("rounds and renders an honest range with unit", () => {
    expect(formatAreaRange(1240.4, 1359.6)).toBe("1.240–1.360 ha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- territorial`
Expected: FAIL ("Cannot find module './territorial'").

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/territorial.ts
import { z } from "zod";

export const ConfianzaSchema = z.enum(["oficial", "observado", "estimado", "declarado"]);
export type Confianza = z.infer<typeof ConfianzaSchema>;

export const IndicadorSchema = z.object({
  etiqueta: z.string(),
  valor: z.string(),
  fonte: z.string(),
  fecha: z.string(),
  confianza: ConfianzaSchema,
  nota: z.string().optional(),
});
export type Indicador = z.infer<typeof IndicadorSchema>;

export const TerritorialSchema = z.object({
  depto: z.string(),
  resumen: z.string().optional(),
  contexto: z.array(IndicadorSchema),
  satelite: z.array(IndicadorSchema),
  chile: z.array(IndicadorSchema),
});
export type Territorial = z.infer<typeof TerritorialSchema>;

export const VinchinaSatelitalSchema = z.object({
  fecha: z.string(),
  haActivaMin: z.number(),
  haActivaMax: z.number(),
  ndviMedio: z.number().optional(),
  ndmiMedio: z.number().optional(),
});
export type VinchinaSatelital = z.infer<typeof VinchinaSatelitalSchema>;

// Honest ± band around a central estimate (default ±10%).
export function areaBand(haCentral: number, relMargin = 0.1): { min: number; max: number } {
  return { min: haCentral * (1 - relMargin), max: haCentral * (1 + relMargin) };
}

// "1.240–1.360 ha" — rounded, es-AR thousands separator, en-dash range.
export function formatAreaRange(haMin: number, haMax: number): string {
  const r = (n: number) => Math.round(n).toLocaleString("es-AR");
  return `${r(haMin)}–${r(haMax)} ha`;
}

export async function fetchTerritorial(): Promise<Territorial | null> {
  try {
    const res = await fetch("/data/territorial-vinchina.json");
    if (!res.ok) return null;
    return TerritorialSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export async function fetchVinchinaSatelital(): Promise<VinchinaSatelital | null> {
  try {
    const res = await fetch("/data/vinchina-satelital.json");
    if (!res.ok) return null;
    return VinchinaSatelitalSchema.parse(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- territorial`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/territorial.ts src/lib/territorial.test.ts
git commit -m "feat(territorial): Zod schemas, loaders + area-range helpers (TDD)"
```

---

## Task 2: Curated official data (Censo 2022 + CEP XXI) + deptos GeoJSON

**Files:**
- Create: `public/data/territorial-vinchina.json`
- Create: `public/data/bermejo-deptos.geojson`

**Data sourcing (curated official values — never invent):**
- Población por departamento: INDEC Censo 2022 — `https://www.indec.gob.ar/ftp/cuadros/poblacion/c2022_larioja_est_c2_12.xlsx`; base oficial Censo 2010 — `https://www.indec.gob.ar/ftp/censos/2010/CuadrosDefinitivos/P1-P_La_Rioja.xls`. Vinchina: **2.731 habitantes en 2010** y **2.699 en 2022**, por lo que la variación 2010→2022 es **−1,2%**.
- Establecimientos y empleo registrados por sector: CEP XXI, tabla **Datos de establecimientos por departamento y actividad** — `https://cdn.produccion.gob.ar/cdn-cep/establecimientos-productivos/Datos_por_departamento_y_actividad.csv` (catálogo: `https://datos.produccion.gob.ar/dataset/distribucion-geografica-de-los-establecimientos-productivos`; metodología: `https://cdn.produccion.gob.ar/cdn-cep/establecimientos-productivos/Metodologia_establecimiento_productivos.pdf`). Para Vinchina, La Rioja, año de referencia 2022: **15 establecimientos registrados**; lideran comercio (4), minería (3) y transporte y almacenamiento (3). La misma tabla suma **216 puestos de trabajo registrados**: construcción (127), transporte y almacenamiento (49), agricultura (11), minería (11), comercio (10), finanzas y seguros (5), administración y apoyo (2), y alojamiento y comidas (1). Son puestos asalariados registrados: excluyen empleo no registrado y trabajo por cuenta propia, incluida la actividad rural informal.
- Paso Pircas Negras: Ministerio del Interior · Centros de Frontera — `https://www.argentina.gob.ar/interior/centros-de-frontera/pircas-negras` (fuente modificada el **2025-05-16**): RN76, 4.164 m y Corredor Bioceánico NOA-Centro.
- Distancia vial Vinchina–Paso Pircas Negras: **183,4 km**, calculada como suma geodésica de los segmentos de la geometría vial oficial simplificada de RN 0076 comprometida en `public/data/corredor-pircas-negras.geojson`; no es una distancia en línea recta. Fuente: DNV, recurso GeoJSON **Rutas Nacionales**, revisión **2025-04-23** — `https://datos.gob.ar/dataset/transporte-rutas-nacionales/archivo/transporte_98a9ee1b-321d-4b68-b00e-bf44ae448e2c`.
- Corredor en el POT: **Plan de Ordenamiento Territorial para el Valle del Bermejo – Informe Final** — `https://www.argentina.gob.ar/sites/default/files/plan_de_ordenamiento_territorial_valle_del_bermejo_la_rioja_informe_final_.pdf`, p. 35, sección **Subsistema físico espacial**: “En la actualidad es incipiente el desarrollo de este corredor internacional”. Es explícitamente un diagnóstico histórico de **2015**, no una evaluación del estado actual.

- [ ] **Step 1: Verify the curated official values**

Verify the INDEC population figures (2.731 in 2010; 2.699 in 2022), the calculated −1,2% variation, and the CEP XXI 2022 aggregation (15 registered establishments; leading sector counts 4/3/3). Confirm every source/reference date above without inferring unavailable figures.

- [ ] **Step 2: Write the curated `territorial-vinchina.json`**

Curated output (keep the structure and provenance semantics exactly):

```json
{
  "depto": "Vinchina",
  "resumen": "Vinchina · Valle del Bermejo (Región I). Insumo de inteligencia territorial para el Plan de Desarrollo Productivo — relacionado al POT 2015 (diagnóstico territorial de base), con datos 2022 + observación satelital.",
  "contexto": [
    { "etiqueta": "Población 2022", "valor": "2.699", "fonte": "INDEC Censo 2022", "fecha": "2022", "confianza": "oficial", "url": "https://www.indec.gob.ar/ftp/cuadros/poblacion/c2022_larioja_est_c2_12.xlsx" },
    { "etiqueta": "Variación 2010–2022", "valor": "−1,2%", "fonte": "INDEC Censos 2010 y 2022", "fecha": "2010–2022", "confianza": "oficial", "url": "https://www.indec.gob.ar/ftp/censos/2010/CuadrosDefinitivos/P1-P_La_Rioja.xls", "nota": "comparación entre Censo 2010 (2.731) y Censo 2022 (2.699); este enlace abre la base 2010 y el indicador anterior, la base 2022; despoblamiento — contrasta con +15,1% provincial" },
    { "etiqueta": "Establecimientos formales por sector", "valor": "15 establecimientos registrados; lideran comercio (4), minería (3) y transporte y almacenamiento (3)", "fonte": "CEP XXI · Datos de establecimientos por departamento y actividad", "fecha": "2022", "confianza": "oficial", "url": "https://cdn.produccion.gob.ar/cdn-cep/establecimientos-productivos/Datos_por_departamento_y_actividad.csv", "nota": "mide establecimientos registrados, no empleo ni producción; subrepresenta la informalidad rural" },
    { "etiqueta": "Empleo formal registrado por sector", "valor": "216 puestos de trabajo registrados: construcción (127), transporte y almacenamiento (49), agricultura (11), minería (11), comercio (10), finanzas y seguros (5), administración y apoyo (2), y alojamiento y comidas (1)", "fonte": "CEP XXI · Datos de establecimientos por departamento y actividad", "fecha": "2022", "confianza": "oficial", "url": "https://cdn.produccion.gob.ar/cdn-cep/establecimientos-productivos/Datos_por_departamento_y_actividad.csv", "nota": "puestos asalariados registrados; excluye empleo no registrado y trabajo por cuenta propia, incluida la actividad rural informal" }
  ],
  "satelite": [],
  "chile": [
    { "etiqueta": "Paso a Chile", "valor": "Pircas Negras (RN76)", "fonte": "Ministerio del Interior · Centros de Frontera", "fecha": "2025-05-16", "confianza": "oficial", "url": "https://www.argentina.gob.ar/interior/centros-de-frontera/pircas-negras", "nota": "4.164 m · RN76 · Corredor Bioceánico NOA-Centro" },
    { "etiqueta": "Distancia vial Vinchina–Paso Pircas Negras", "valor": "183,4 km", "fonte": "DNV · Rutas Nacionales (RN 0076)", "fecha": "2025-04-23", "confianza": "estimado", "url": "https://datos.gob.ar/dataset/transporte-rutas-nacionales/archivo/transporte_98a9ee1b-321d-4b68-b00e-bf44ae448e2c", "nota": "calculada sobre la geometría vial oficial simplificada de RN 0076; no es distancia en línea recta" },
    { "etiqueta": "Diagnóstico del corredor en el POT (2015)", "valor": "incipiente", "fonte": "Plan de Ordenamiento Territorial para el Valle del Bermejo – Informe Final", "fecha": "2015", "confianza": "oficial", "url": "https://www.argentina.gob.ar/sites/default/files/plan_de_ordenamiento_territorial_valle_del_bermejo_la_rioja_informe_final_.pdf", "nota": "diagnóstico histórico de 2015; “En la actualidad es incipiente el desarrollo de este corredor internacional” (p. 35, Subsistema físico espacial)" }
  ]
}
```

The `satelite` array stays empty here — it is composed at runtime from `vinchina-satelital.json` (Task 4) by the page (Task 6).

- [ ] **Step 3: Derive `bermejo-deptos.geojson` from the existing layer**

Run this one-off (Bash) to extract the 3 Bermejo deptos from the existing departamentos layer:

```bash
cd "$(git rev-parse --show-toplevel)" && python - <<'PY'
import json
src = json.load(open("public/data/departamentos.geojson", encoding="utf-8"))
keep = {"Vinchina", "General Lamadrid", "Coronel Felipe Varela", "General Felipe Varela", "Felipe Varela"}
feats = [f for f in src["features"] if f.get("properties", {}).get("nombre") in keep]
print("matched:", [f["properties"]["nombre"] for f in feats])
json.dump({"type": "FeatureCollection", "features": feats}, open("public/data/bermejo-deptos.geojson", "w", encoding="utf-8"), ensure_ascii=False)
PY
```

Expected: prints the 3 matched names. If a name doesn't match, inspect `departamentos.geojson` property names and adjust the `keep` set.

- [ ] **Step 4: Validate the JSON parses against the schema**

```bash
node -e "const {TerritorialSchema}=require('ts-node/register')||{}; " 2>/dev/null; npx tsx -e "import {TerritorialSchema} from './src/lib/territorial'; import fs from 'fs'; TerritorialSchema.parse(JSON.parse(fs.readFileSync('public/data/territorial-vinchina.json','utf8'))); console.log('territorial-vinchina.json OK');"
```

Expected: "territorial-vinchina.json OK". (If `tsx` is unavailable, run `npm test -- territorial` after temporarily importing the file in a test; simplest is to trust the schema + the build.)

- [ ] **Step 5: Commit**

```bash
git add public/data/territorial-vinchina.json public/data/bermejo-deptos.geojson
git commit -m "data(territorial): curated Vinchina indicators (Censo 2022 + CEP XXI) + Bermejo deptos geojson"
```

---

## Task 3: Geo layers — localidades + corredor a Pircas Negras

**Files:**
- Create: `public/data/vinchina-localidades.geojson`
- Create: `public/data/corredor-pircas-negras.geojson`

Use official coordinates in `(lon, lat)` order. Argentina Georef returns Villa San José de Vinchina at `[-68.2048448095049, -28.7536971019394]` (`id=46098020`) and Jagüé at `[-68.3857405424316, -28.6637211783493]` (`id=46098010`), consulted 2026-06-18. The previous approximate Jagüé point was materially wrong and must not be reused. For the corridor, do not connect locality/pass points with straight segments: extract `RN 0076` from the official DNV `idera:Rutas_Nacionales` WFS, clip the `Sentido=A` feature `id=341` from the vertex nearest the Vinchina centroid through its western endpoint, then simplify the extracted road geometry with the documented 100 m tolerance. The result is for visualization, not survey/mensura use.

- [ ] **Step 1: Write `vinchina-localidades.geojson`**

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "nombre": "Vinchina", "tipo": "cabecera", "fuente": "Argentina Georef API", "fuente_id": "46098020", "fecha_consulta": "2026-06-18" }, "geometry": { "type": "Point", "coordinates": [-68.2048448095049, -28.7536971019394] } },
    { "type": "Feature", "properties": { "nombre": "Jagüé", "tipo": "localidad", "fuente": "Argentina Georef API", "fuente_id": "46098010", "fecha_consulta": "2026-06-18" }, "geometry": { "type": "Point", "coordinates": [-68.3857405424316, -28.6637211783493] } }
  ]
}
```

- [ ] **Step 2: Write `corredor-pircas-negras.geojson`**

Use the official GeoJSON resource `transporte_98a9ee1b-321d-4b68-b00e-bf44ae448e2c` from dataset `transporte_abe45f2c-cf9f-458e-8b51-03ecda6f708a` (DNV Rutas Nacionales), revised 2025-04-23 and consulted 2026-06-18. Query the `idera:Rutas_Nacionales` WFS with `CQL_FILTER=RTN='0076'`, select feature `id=341`, perform the clip described above, and apply Douglas–Peucker in a local metric projection at 100 m. The committed output has 173 vertices from a 2,111-vertex clip and a measured maximum source-vertex deviation of 97.5 m. Preserve the service URL, IDs, dates, method, tolerance, fidelity, and non-survey disclaimer in feature properties; the generated coordinate array in `public/data/corredor-pircas-negras.geojson` is authoritative for this plan.

- [ ] **Step 3: Verify both parse as JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/data/vinchina-localidades.geojson')); JSON.parse(require('fs').readFileSync('public/data/corredor-pircas-negras.geojson')); console.log('geojson OK')"`
Expected: "geojson OK".

- [ ] **Step 4: Commit**

```bash
git add public/data/vinchina-localidades.geojson public/data/corredor-pircas-negras.geojson
git commit -m "data(territorial): Vinchina localidades + corredor Pircas Negras geojson"
```

---

## Task 4: Sentinel-2 Vinchina pipeline (NDVI + active-area estimate + active-zone NDMI)

**Files:**
- Implement/test: `scripts/vinchina_ndvi.py`, `scripts/test_vinchina_ndvi.py`
- Read AOI geometry: `public/data/bermejo-deptos.geojson`
- Modify: `.github/workflows/satelital.yml` (focused test + script in the run step)

**Reuses** `scripts/s2_common.py` helpers (`find_scenes`, `download_asset`, `read_band_to_4326`, `to_reflectance`). The query/display bbox is `[-68.40, -28.90, -68.05, -28.60]`, but every scientific statistic is clipped to the official `properties.nombre == "Vinchina"` Polygon/MultiPolygon from `public/data/bermejo-deptos.geojson`. Rasterize that boundary on the native-ish analysis grid (`s2_common.DST_RES`) with `all_touched=False`; usable coverage is jointly valid NDVI+NDMI pixels inside that boundary divided by all boundary pixels inside the bbox. NDVI active threshold: `0.25` (arid baseline). NDMI is averaged only over those active NDVI pixels. The ±15% output remains an unvalidated heuristic scenario band, not uncertainty or a confidence interval.

- [ ] **Step 1: Implement the tested pipeline contract**

`scripts/vinchina_ndvi.py` is the executable source of truth. Its implementation must keep these concrete API contracts:

- Resolve repository outputs with `pathlib.Path` from the script's own `ROOT`; do not depend on the process working directory or treat `s2_common.ROOT` as a `Path`.
- Load exactly one official `properties.nombre == "Vinchina"` Polygon/MultiPolygon from `public/data/bermejo-deptos.geojson`. `rasterize_department_mask` lazy-imports `rasterio.features.geometry_mask` and `rasterio.transform.from_bounds`, uses the same rounded width/height as `read_band_to_4326`, and sets `invert=True, all_touched=False`.
- Query newest scenes with `s2.find_scenes(BBOX, mgrs_tile=None, max_cloud=60, limit=10)`, retain the scene-bbox prefilter, and attempt at most three candidates.
- Use the real helper contract `download_asset(href, dst_path)`: pass each STAC asset's `.href` first and a temporary local destination second for B04, B08, B11, and SCL.
- Reproject B04/B08/B11 onto `s2.DST_RES == ANALYSIS_RES` with the helper's default bilinear resampling. Reproject SCL with `resampling=s2.Resampling.nearest`; rasterio remains lazy from the pure-test module's perspective.
- Build clear land from SCL classes 4/5 and intersect it with the department mask and positive, finite, offset-corrected reflectances. Compute NDVI from B08/B04 and NDMI from B08/B11, then require both indices finite. Usable coverage is `jointly_usable.sum() / department_mask.sum()` and must be at least 95%.
- Define active vegetation as jointly usable NDVI `> 0.25`. Compute hectares on `ANALYSIS_RES`, with longitude scaled by `cos(latitude)`. Emit the unvalidated heuristic ±15% scenario band. Add `ndviMedio` and `ndmiMedio` only when the published active area is nonzero; NDMI uses exactly the active-NDVI pixels.
- Keep outside-boundary pixels as NaN. `resize_colorized_for_display` alone downsamples to `DISPLAY_RES`, preserves alpha in `{0, 200}`, and the atomic writer publishes the PNG, bounds metadata, and schema-compatible JSON only after a scene passes coverage.

- [ ] **Step 2: Run focused tests and syntax checks**

```powershell
python -m unittest scripts/test_vinchina_ndvi.py
python -m py_compile scripts/vinchina_ndvi.py scripts/s2_common.py scripts/test_vinchina_ndvi.py
```

Expected: both commands exit 0. The full network/STAC run belongs in GitHub Actions because local geospatial dependencies may be unavailable.

- [ ] **Step 3: Preserve workflow test/order behavior**

The workflow installs rasterio and the other Python dependencies, then runs the focused unittest before the adjacent `python scripts/modis_ndvi.py` and `python scripts/vinchina_ndvi.py` commands. Keep MODIS immediately before Vinchina.

- [ ] **Step 4: Verify the output contract**

`public/data/vinchina-satelital.json` must satisfy `VinchinaSatelitalSchema`: required `fecha`, `haActivaMin`, and `haActivaMax`; optional active-zone `ndviMedio`/`ndmiMedio`, with neither mean allowed when `haActivaMax == 0`. The bounds metadata must state the Vinchina AOI mask and active-zone NDMI method; the overlay must remain transparent outside the boundary.

---

## Task 5: UI components — SourceBadge, IndicatorCard, BriefingChapter

**Files:**
- Create: `src/components/territorial/source-badge.tsx`
- Create: `src/components/territorial/indicator-card.tsx`
- Create: `src/components/territorial/briefing-chapter.tsx`

- [ ] **Step 1: Write `source-badge.tsx`**

```tsx
"use client";

import type { Confianza } from "@/lib/territorial";

const TONE: Record<Confianza, string> = {
  oficial: "bg-emerald-50 text-emerald-800",
  observado: "bg-sky-50 text-sky-800",
  estimado: "bg-amber-50 text-amber-800",
  declarado: "bg-stone-100 text-stone-700",
};

// fonte · data · confiança chip. Always rendered with every indicator.
export default function SourceBadge({
  fonte,
  fecha,
  confianza,
}: {
  fonte: string;
  fecha: string;
  confianza: Confianza;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`rounded-full px-1.5 py-0.5 font-medium ${TONE[confianza]}`}>{confianza}</span>
      <span>{fonte}</span>
      <span aria-hidden>·</span>
      <span>{fecha}</span>
    </span>
  );
}
```

- [ ] **Step 2: Write `indicator-card.tsx`**

```tsx
"use client";

import type { Indicador } from "@/lib/territorial";
import SourceBadge from "@/components/territorial/source-badge";

export default function IndicatorCard({ ind }: { ind: Indicador }) {
  return (
    <div className="glass-panel space-y-1 p-3">
      <div className="text-[11px] text-muted-foreground">{ind.etiqueta}</div>
      <div className="text-sm text-[var(--foreground)]">{ind.valor}</div>
      {ind.nota && <div className="text-[11px] text-muted-foreground">{ind.nota}</div>}
      <SourceBadge fonte={ind.fonte} fecha={ind.fecha} confianza={ind.confianza} />
    </div>
  );
}
```

- [ ] **Step 3: Write `briefing-chapter.tsx`**

```tsx
"use client";

import type { Indicador } from "@/lib/territorial";
import IndicatorCard from "@/components/territorial/indicator-card";

// One chapter of the briefing arc. Renders nothing when it has no indicators.
export default function BriefingChapter({
  numero,
  titulo,
  indicadores,
}: {
  numero: number;
  titulo: string;
  indicadores: Indicador[];
}) {
  if (indicadores.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm text-[var(--foreground)]">
        <span className="text-muted-foreground">{numero}.</span> {titulo}
      </h3>
      {indicadores.map((ind, i) => (
        <IndicatorCard key={`${ind.etiqueta}-${i}`} ind={ind} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Lint the new components**

Run: `npx eslint src/components/territorial/`
Expected: exit 0 (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/territorial/
git commit -m "feat(territorial): SourceBadge, IndicatorCard, BriefingChapter components"
```

---

## Task 6: `/bermejo` route — map + briefing wiring

**Files:**
- Create: `src/app/bermejo/page.tsx`

Loads the territorial briefing + the satellite estimate, composes the `satelite` chapter at runtime (honest range via `formatAreaRange`), and renders the 3D map (3 deptos, Vinchina highlight, corridor) beside the briefing aside.

- [ ] **Step 1: Write `src/app/bermejo/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import MapShell from "@/components/map-shell";
import ResizableAside from "@/components/resizable-aside";
import BriefingChapter from "@/components/territorial/briefing-chapter";
import {
  fetchTerritorial,
  fetchVinchinaSatelital,
  formatAreaRange,
  type Territorial,
  type Indicador,
} from "@/lib/territorial";

const VINCHINA = "Vinchina";

export default function BermejoPage() {
  const [data, setData] = useState<Territorial | null>(null);
  const [sateliteExtra, setSateliteExtra] = useState<Indicador[]>([]);

  useEffect(() => {
    fetchTerritorial().then(setData);
  }, []);

  // Compose the satélite chapter at runtime from the pipeline estimate (honest range).
  useEffect(() => {
    fetchVinchinaSatelital().then((s) => {
      if (!s) return;
      const inds: Indicador[] = [
        {
          etiqueta: "Área con vegetación activa observada",
          valor: formatAreaRange(s.haActivaMin, s.haActivaMax),
          fonte: "Sentinel-2 (Copernicus)",
          fecha: s.fecha,
          confianza: "estimado",
          nota: "vegetación activa (cultivo o natural) — distinguir cultivo requiere validación local",
        },
      ];
      if (s.ndviMedio != null) {
        inds.push({
          etiqueta: "NDVI medio (zonas activas)",
          valor: s.ndviMedio.toFixed(2),
          fonte: "Sentinel-2 (Copernicus)",
          fecha: s.fecha,
          confianza: "observado",
        });
      }
      setSateliteExtra(inds);
    });
  }, []);

  const onReady = useCallback(async (map: maplibregl.Map) => {
    type GJ = maplibregl.GeoJSONSourceSpecification["data"];
    const add = async (id: string, url: string) => {
      const gj = await fetch(url).then((r) => (r.ok ? r.json() : null));
      if (gj) map.addSource(id, { type: "geojson", data: gj as GJ });
      return !!gj;
    };

    if (await add("bermejo", "/data/bermejo-deptos.geojson")) {
      // Context deptos (muted) + Vinchina highlight.
      map.addLayer({ id: "bermejo-fill", type: "fill", source: "bermejo", paint: { "fill-color": "#94a3b8", "fill-opacity": 0.12 } });
      map.addLayer({ id: "bermejo-line", type: "line", source: "bermejo", paint: { "line-color": "#ffffff", "line-width": 1 } });
      map.addLayer({
        id: "vinchina-hl",
        type: "line",
        source: "bermejo",
        filter: ["==", ["get", "nombre"], VINCHINA],
        paint: { "line-color": "#10b981", "line-width": 3 },
      });
    }

    // Sentinel-2 NDVI overlay over Vinchina (defensive: skip if not generated yet).
    try {
      const b = await fetch("/raster/vinchina-ndvi-bounds.json").then((r) => (r.ok ? r.json() : null));
      const ok = await fetch("/raster/vinchina-ndvi.png", { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (b && ok) {
        map.addSource("vinchina-ndvi", { type: "image", url: "/raster/vinchina-ndvi.png", coordinates: b.coordinates });
        map.addLayer({ id: "vinchina-ndvi", type: "raster", source: "vinchina-ndvi", paint: { "raster-opacity": 0.85 } });
      }
    } catch (e) {
      console.warn("Vinchina NDVI overlay skipped", e);
    }

    if (await add("corredor", "/data/corredor-pircas-negras.geojson")) {
      map.addLayer({ id: "corredor", type: "line", source: "corredor", paint: { "line-color": "#f59e0b", "line-width": 2, "line-dasharray": [2, 1] } });
    }
    if (await add("localidades", "/data/vinchina-localidades.geojson")) {
      map.addLayer({ id: "localidades", type: "circle", source: "localidades", paint: { "circle-radius": 4, "circle-color": "#0ea5e9", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
    }
  }, []);

  return (
    <div className="bg-background text-foreground flex h-full">
      <div className="relative flex-1">
        <div className="absolute left-2 top-2 z-10 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">
          Inteligencia territorial · Valle del Bermejo
        </div>
        <MapShell center={[-68.5, -28.5]} zoom={7.5} onReady={onReady} />
      </div>
      <ResizableAside>
        <div>
          <p className="text-[11px] text-muted-foreground">Plan de Desarrollo Productivo · Valle del Bermejo</p>
          <h2 className="text-base text-[var(--foreground)]">Vinchina · Valle del Bermejo</h2>
          {data?.resumen && <p className="mt-1.5 text-sm text-muted-foreground">{data.resumen}</p>}
        </div>

        {!data && <div className="glass-panel p-5 text-sm text-muted-foreground">Cargando briefing territorial…</div>}

        {data && (
          <>
            <BriefingChapter numero={1} titulo="Contexto socio-productivo" indicadores={data.contexto} />
            <BriefingChapter numero={2} titulo="Producción observada (satélite)" indicadores={[...data.satelite, ...sateliteExtra]} />
            <BriefingChapter numero={3} titulo="Logística y conexión con Chile" indicadores={data.chile} />
          </>
        )}
      </ResizableAside>
    </div>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npx eslint src/app/bermejo/page.tsx && npx tsc --noEmit`
Expected: both exit 0. (Verify `MapShell` and `ResizableAside` import paths/props match the existing components; adjust if the real props differ.)

- [ ] **Step 3: Commit**

```bash
git add src/app/bermejo/page.tsx
git commit -m "feat(territorial): /bermejo route — 3D map (Vinchina + corredor Chile) + briefing aside"
```

---

## Task 7: Verify + merge

**Files:** none (verification + integration).

- [ ] **Step 1: Full gate**

Run (dev server must NOT be running): `npm test -- --run && npm run lint && npm run build`
Expected: tests pass; eslint 0 errors; build OK with `/bermejo` in the route table.

- [ ] **Step 2: DOM smoke-test (optional, if a dev server is used)**

Start dev, load `/bermejo`, check `preview_console_logs` for errors and `preview_snapshot` for the briefing chapters. Note: the WebGL map screenshot is broken in preview — verify the map visually on the Vercel deploy.

- [ ] **Step 3: Merge to main + push + trigger the Action**

```bash
git checkout main && git pull --rebase origin main
git merge --no-ff feat/bermejo-territorial-f0 -m "Merge feat/bermejo-territorial-f0: F0 Territorial — Briefing 3D de Vinchina"
git push origin main
gh workflow run satelital.yml
```

Then watch the run: `gh run watch <id> --exit-status` and confirm `public/data/vinchina-satelital.json` + `public/raster/vinchina-ndvi.png` are committed by the bot (Vercel redeploys). The briefing's satélite chapter then shows the real observed area range.

---

## Self-Review

**Spec coverage:** §3 architecture → Tasks 1,5,6; §4 telas (map + 3-chapter briefing) → Task 6 + Task 5; §5 dados/fontes/confiança → Tasks 1 (Confianza enum + SourceBadge in Task 5), 2 (curated official), 4 (satellite estimate, honest range + "vegetación activa" wording in Task 6 Step 1); §6 pipeline → Task 4; §7 testing → Task 1 + Task 7. Diagnóstico del corredor como "incipiente" en el POT 2015 → Task 2 JSON; corredor geográfico → Task 3 geojson. All covered.

**Placeholder scan:** Task 2 records the curated official values and exact source/reference dates; no `REAL` value placeholders remain. All code steps contain complete code.

**Type consistency:** `Indicador`/`Territorial`/`VinchinaSatelital`/`Confianza` defined in Task 1 are used consistently in Tasks 5 (SourceBadge `Confianza`, IndicatorCard `Indicador`) and 6 (`Territorial`, `Indicador`, `formatAreaRange`). `formatAreaRange(min,max)` signature matches its use in Task 6. `vinchina-satelital.json` written by Task 4 matches `VinchinaSatelitalSchema` (fecha, haActivaMin, haActivaMax, optional active-zone ndviMedio/ndmiMedio) read in Task 6.

**Open implementation checks flagged for the worker:** `s2_common.find_scenes` tile arg (Task 4 note); `MapShell`/`ResizableAside` prop shapes (Task 6 Step 2); depto name strings in `departamentos.geojson` (Task 2 Step 3).

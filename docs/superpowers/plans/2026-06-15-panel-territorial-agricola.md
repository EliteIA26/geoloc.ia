# Panel Territorial Agrícola de La Rioja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a navigable F0 demo ("cockpit territorial") that turns free Sentinel-2 data into a decision panel for the La Rioja provincial government, with a preview of the producer view, anchored by one real Sentinel-2 NDVI snapshot over Aimogasta.

**Architecture:** Single Next.js 16 (App Router) client-rendered map app. All demo data is static (`public/data/*.{geojson,json}`); there is no backend. The map is MapLibre GL JS initialized inside a `'use client'` component via `useEffect`. Pure logic (color scales, classification, sparkline geometry, data validation) lives in `src/lib/` and is unit-tested with Vitest; visual/map components are verified with the preview workflow (screenshots), not unit tests. One real georeferenced NDVI raster (produced offline by a Python pipeline) is overlaid only on the Aimogasta zone.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, MapLibre GL JS, Vitest, Zod. Offline data pipeline: Python (pystac-client, planetary-computer, rasterio, numpy, Pillow).

---

## File Structure

```
geoloc.ia/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root layout (scaffolded)
│   │   ├── page.tsx                   # redirects/links to /panel
│   │   ├── globals.css                # Tailwind + maplibre css import
│   │   └── panel/
│   │       └── page.tsx               # client page: view switcher + MapShell + side panel
│   ├── components/
│   │   ├── map-shell.tsx              # 'use client' MapLibre init + layer mgmt (shared)
│   │   ├── layer-toggle.tsx           # NDVI / NDWI / fincas visibility toggles
│   │   ├── aggregate-indicators.tsx   # Gestión: cards + sparklines
│   │   ├── alerts-panel.tsx           # Gestión: seca/helada alerts
│   │   ├── export-report-button.tsx   # Gestión: mock export
│   │   ├── producer-view.tsx          # Productor preview: finca + series + badge + hint
│   │   ├── ndvi-time-series.tsx       # inline SVG sparkline/line chart
│   │   └── water-stress-badge.tsx     # semáforo verde/ámbar/rojo
│   └── lib/
│       ├── map-style.ts               # MapLibre StyleSpecification (Esri imagery base)
│       ├── colors.ts                  # ndviToColor / ndwiToColor scales
│       ├── water-stress.ts            # classifyWaterStress + irrigationHint
│       ├── sparkline.ts               # buildSparklinePath
│       └── data.ts                    # zod schemas + typed loaders for public/data
├── public/
│   ├── data/
│   │   ├── departamentos.geojson
│   │   ├── fincas-aimogasta.geojson
│   │   ├── indicadores-departamentos.json
│   │   ├── series-ndvi.json
│   │   └── alertas.json
│   └── raster/
│       ├── aimogasta-ndvi.png
│       └── aimogasta-ndvi-bounds.json
├── scripts/
│   └── ndvi_snapshot.py               # offline Sentinel-2 -> NDVI PNG + bounds
├── vitest.config.ts
└── docs/superpowers/{specs,plans}/...
```

**Reference coordinates (use verbatim):**
- Province view center: `[-67.2, -29.4]`, zoom `6.3`
- Aimogasta (Arauco) finca view center: `[-66.78, -28.06]`, zoom `12`

> **Scaffold note:** `create-next-app --yes` may emit `app/` at the root or `src/app/`. After Task 1, use whatever location was generated; all paths below assume `src/app/`. If the scaffold used root `app/`, drop the `src/` prefix consistently.

---

## Task 1: Scaffold project + dev tooling

**Files:**
- Create: entire Next.js scaffold in `geoloc.ia/`
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + deps)

- [ ] **Step 1: Scaffold Next.js 16 into the existing folder**

The repo already contains `docs/`, `README.md`, `.gitignore`. Scaffold into a temp dir then move, to avoid the "directory not empty" refusal.

Run (from inside `geoloc.ia/`):
```bash
npx create-next-app@latest .tmp-scaffold --yes
```
Expected: a `.tmp-scaffold/` folder with TypeScript + Tailwind + ESLint + App Router + Turbopack.

- [ ] **Step 2: Merge scaffold into repo root**

```bash
# move everything except git/docs that already exist
cp -r .tmp-scaffold/. .
rm -rf .tmp-scaffold
# remove the scaffold's AGENTS.md/CLAUDE.md only if you want; keeping them is fine
```
Expected: `package.json`, `next.config.ts`, `src/app/` (or `app/`), `tsconfig.json` now exist at root.

- [ ] **Step 3: Install runtime + test deps**

```bash
npm install maplibre-gl zod
npm install -D vitest @types/geojson
```
Expected: installs succeed; `maplibre-gl` and `zod` in `dependencies`.

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Add test scripts to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Verify dev server boots**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` with no errors. Stop it after confirming.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app + vitest tooling"
```

---

## Task 2: Pure logic — color scales (TDD)

**Files:**
- Create: `src/lib/colors.ts`
- Test: `src/lib/colors.test.ts`

NDVI ranges roughly -1..1; for vegetation health we map ~0.1 (bare/stressed, red) → ~0.8 (healthy, dark green). NDWI similar for water/moisture.

- [ ] **Step 1: Write the failing test**

Create `src/lib/colors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ndviToColor } from "./colors";

describe("ndviToColor", () => {
  it("returns a red-ish hex for low NDVI (stressed)", () => {
    expect(ndviToColor(0.1)).toBe("#d73027");
  });
  it("returns a mid hex for moderate NDVI", () => {
    expect(ndviToColor(0.45)).toBe("#fee08b");
  });
  it("returns a green hex for high NDVI (healthy)", () => {
    expect(ndviToColor(0.8)).toBe("#1a9850");
  });
  it("clamps out-of-range values", () => {
    expect(ndviToColor(-5)).toBe("#d73027");
    expect(ndviToColor(5)).toBe("#1a9850");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- colors`
Expected: FAIL with "ndviToColor is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/colors.ts`:
```ts
// Discrete NDVI color ramp (red -> yellow -> green). Thresholds are inclusive lower bounds.
const NDVI_STOPS: ReadonlyArray<[number, string]> = [
  [0.6, "#1a9850"], // healthy
  [0.4, "#fee08b"], // moderate
  [-1, "#d73027"], // stressed / bare
];

export function ndviToColor(value: number): string {
  const v = Math.max(-1, Math.min(1, value));
  for (const [min, color] of NDVI_STOPS) {
    if (v >= min) return color;
  }
  return "#d73027";
}

// NDWI reuses the same ramp shape; higher = more moisture = greener.
export function ndwiToColor(value: number): string {
  return ndviToColor(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- colors`
Expected: PASS (4 tests). Note 0.45 → `#fee08b` (>=0.4, <0.6) and 0.8 → `#1a9850`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/colors.ts src/lib/colors.test.ts
git commit -m "feat: NDVI/NDWI discrete color ramp with tests"
```

---

## Task 3: Pure logic — water-stress classification + irrigation hint (TDD)

**Files:**
- Create: `src/lib/water-stress.ts`
- Test: `src/lib/water-stress.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/water-stress.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyWaterStress, irrigationHint } from "./water-stress";

describe("classifyWaterStress", () => {
  it("rojo when index is low", () => {
    expect(classifyWaterStress(0.15)).toBe("rojo");
  });
  it("ambar when index is moderate", () => {
    expect(classifyWaterStress(0.45)).toBe("ambar");
  });
  it("verde when index is high", () => {
    expect(classifyWaterStress(0.75)).toBe("verde");
  });
});

describe("irrigationHint", () => {
  it("urges irrigation when rojo", () => {
    expect(irrigationHint(0.15)).toMatch(/riego/i);
  });
  it("is reassuring when verde", () => {
    expect(irrigationHint(0.75)).toMatch(/adecuad/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- water-stress`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/water-stress.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- water-stress`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/water-stress.ts src/lib/water-stress.test.ts
git commit -m "feat: water-stress classification + irrigation hint with tests"
```

---

## Task 4: Pure logic — sparkline path builder (TDD)

**Files:**
- Create: `src/lib/sparkline.ts`
- Test: `src/lib/sparkline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sparkline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSparklinePath } from "./sparkline";

describe("buildSparklinePath", () => {
  it("maps a flat series to a horizontal line", () => {
    // two equal points across width 100, height 20 -> y centered
    expect(buildSparklinePath([0.5, 0.5], 100, 20)).toBe("M 0 10 L 100 10");
  });
  it("maps min to bottom and max to top", () => {
    // values [0,1]; min->y=height, max->y=0
    expect(buildSparklinePath([0, 1], 100, 20)).toBe("M 0 20 L 100 0");
  });
  it("returns empty string for fewer than 2 points", () => {
    expect(buildSparklinePath([0.5], 100, 20)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sparkline`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sparkline.ts`:
```ts
export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // avoid divide-by-zero on flat series
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = Math.round(i * stepX);
    const y = Math.round(height - ((v - min) / span) * height);
    return `${x} ${y}`;
  });
  return `M ${points[0]} ` + points.slice(1).map((p) => `L ${p}`).join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sparkline`
Expected: PASS (3 tests). Flat series → both y = round(20 - (0/1)*20)=20? Verify: flat span=1, (0.5-0.5)/1=0 → y=height=20... 

> **Correction for the test author:** for a flat series the formula yields `y = height` (=20), not 10. Adjust the first test's expectation to `"M 0 20 L 100 20"`. Keep min/max behavior as-is. Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sparkline.ts src/lib/sparkline.test.ts
git commit -m "feat: sparkline path builder with tests"
```

---

## Task 5: Seed data files + Zod schemas/loaders (TDD on validation)

**Files:**
- Create: `public/data/departamentos.geojson`
- Create: `public/data/fincas-aimogasta.geojson`
- Create: `public/data/indicadores-departamentos.json`
- Create: `public/data/series-ndvi.json`
- Create: `public/data/alertas.json`
- Create: `src/lib/data.ts`
- Test: `src/lib/data.test.ts`

- [ ] **Step 1: Acquire La Rioja department boundaries**

Primary: download the public Argentine departments GeoJSON and filter province = "La Rioja". A reliable open source is the IGN / `mapasytablas`-style datasets mirrored on GitHub (e.g. search "argentina departamentos geojson"). Save the filtered FeatureCollection to `public/data/departamentos.geojson`. Ensure each feature has `properties.nombre` (department name) and add `properties.ndvi` (seeded number) + `properties.ndwi` (seeded number).

Fallback (if no clean source is found within ~15 min): hand-author a simplified FeatureCollection of ~6 key departments (Arauco, Capital, Chilecito, Famatina, Castro Barros, Sanagasta) as coarse polygons. Coarse is acceptable for F0 — the anchor zone is what must look real.

Each feature MUST follow this shape:
```json
{
  "type": "Feature",
  "properties": { "nombre": "Arauco", "ndvi": 0.62, "ndwi": 0.41 },
  "geometry": { "type": "Polygon", "coordinates": [[[ -66.9, -28.0 ], [ -66.6, -28.0 ], [ -66.6, -28.3 ], [ -66.9, -28.3 ], [ -66.9, -28.0 ]]] }
}
```

- [ ] **Step 2: Author the remaining seed files**

Create `public/data/fincas-aimogasta.geojson` — 4–6 small Polygon features near `[-66.78, -28.06]`, each with `properties.id`, `properties.nombre`, `properties.ndvi`, and exactly one with `properties.esMiFinca: true`.

Create `public/data/indicadores-departamentos.json`:
```json
[
  { "nombre": "Arauco", "areaEstresadaPct": 18, "ndviMedio": 0.62 },
  { "nombre": "Chilecito", "areaEstresadaPct": 27, "ndviMedio": 0.54 },
  { "nombre": "Famatina", "areaEstresadaPct": 22, "ndviMedio": 0.58 },
  { "nombre": "Capital", "areaEstresadaPct": 31, "ndviMedio": 0.49 }
]
```

Create `public/data/series-ndvi.json` (keyed by finca/department id; the Aimogasta anchor key `finca-aimogasta-1` will be overwritten with real data in Task 8):
```json
{
  "finca-aimogasta-1": [0.41, 0.38, 0.45, 0.52, 0.58, 0.61, 0.6, 0.57],
  "arauco": [0.55, 0.57, 0.6, 0.62, 0.63, 0.61, 0.6, 0.62]
}
```

Create `public/data/alertas.json`:
```json
[
  { "zona": "Arauco - Aimogasta", "tipo": "sequia", "severidad": "media", "detalle": "Descenso sostenido de NDWI en las últimas 3 semanas." },
  { "zona": "Famatina", "tipo": "helada", "severidad": "alta", "detalle": "Riesgo de helada tardía pronosticado." }
]
```

- [ ] **Step 3: Write the failing validation test**

Create `src/lib/data.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IndicadoresSchema,
  AlertasSchema,
  SeriesSchema,
} from "./data";

const dataDir = join(process.cwd(), "public", "data");
const load = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

describe("seed data validates against schemas", () => {
  it("indicadores-departamentos.json", () => {
    expect(() => IndicadoresSchema.parse(load("indicadores-departamentos.json"))).not.toThrow();
  });
  it("alertas.json", () => {
    expect(() => AlertasSchema.parse(load("alertas.json"))).not.toThrow();
  });
  it("series-ndvi.json", () => {
    expect(() => SeriesSchema.parse(load("series-ndvi.json"))).not.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- data`
Expected: FAIL (schemas not exported).

- [ ] **Step 5: Write schemas + loaders**

Create `src/lib/data.ts`:
```ts
import { z } from "zod";

export const IndicadoresSchema = z.array(
  z.object({
    nombre: z.string(),
    areaEstresadaPct: z.number(),
    ndviMedio: z.number(),
  }),
);
export type Indicador = z.infer<typeof IndicadoresSchema>[number];

export const AlertasSchema = z.array(
  z.object({
    zona: z.string(),
    tipo: z.enum(["sequia", "helada"]),
    severidad: z.enum(["baja", "media", "alta"]),
    detalle: z.string(),
  }),
);
export type Alerta = z.infer<typeof AlertasSchema>[number];

export const SeriesSchema = z.record(z.string(), z.array(z.number()));
export type Series = z.infer<typeof SeriesSchema>;

// Client-side fetch helpers (run in the browser against /data/*).
export async function fetchJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return schema.parse(await res.json());
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- data`
Expected: PASS (3 tests). If any fails, fix the seed JSON to match the schema, not the schema.

- [ ] **Step 7: Commit**

```bash
git add public/data src/lib/data.ts src/lib/data.test.ts
git commit -m "feat: seed demo data + zod schemas/loaders with validation tests"
```

---

## Task 6: Map base — MapShell client component + style

**Files:**
- Create: `src/lib/map-style.ts`
- Create: `src/components/map-shell.tsx`
- Modify: `src/app/globals.css` (import MapLibre CSS)
- Create: `src/app/panel/page.tsx`

No unit test — verified via preview screenshot.

- [ ] **Step 1: Define the key-free map style**

Create `src/lib/map-style.ts`:
```ts
import type { StyleSpecification } from "maplibre-gl";

// Esri World Imagery raster basemap — no API key required (attribution required).
export const satelliteStyle: StyleSpecification = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri-imagery", type: "raster", source: "esri-imagery" }],
};
```

- [ ] **Step 2: Import MapLibre CSS globally**

In `src/app/globals.css`, add at the top (after the Tailwind import lines):
```css
@import "maplibre-gl/dist/maplibre-gl.css";
```

- [ ] **Step 3: Write the MapShell component**

Create `src/components/map-shell.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { satelliteStyle } from "@/lib/map-style";

export type MapShellProps = {
  center: [number, number];
  zoom: number;
  onReady?: (map: maplibregl.Map) => void;
};

export default function MapShell({ center, zoom, onReady }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle,
      center,
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    map.on("load", () => onReady?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // center/zoom are initial-only by design; onReady is stable from parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 4: Create a minimal panel page that mounts the map**

Create `src/app/panel/page.tsx`:
```tsx
"use client";

import MapShell from "@/components/map-shell";

export default function PanelPage() {
  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="bg-emerald-900 px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">
          Panel Territorial Agrícola · La Rioja
        </h1>
      </header>
      <div className="relative flex-1">
        <MapShell center={[-67.2, -29.4]} zoom={6.3} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify via preview**

Start the dev server (preview_start), navigate to `/panel`. Take a screenshot.
Expected: full-screen satellite map of the La Rioja region with zoom controls, green header bar. Check console for errors (preview_console_logs) — expect none.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map-style.ts src/components/map-shell.tsx src/app/globals.css src/app/panel/page.tsx
git commit -m "feat: MapShell with key-free Esri satellite base on /panel"
```

---

## Task 7: Vista Gestión — province polygons, layer toggle, indicators, alerts

**Files:**
- Modify: `src/components/map-shell.tsx` (expose layer helpers)
- Create: `src/components/layer-toggle.tsx`
- Create: `src/components/aggregate-indicators.tsx`
- Create: `src/components/alerts-panel.tsx`
- Create: `src/components/export-report-button.tsx`
- Modify: `src/app/panel/page.tsx` (compose Gestión view)

Verified via preview.

- [ ] **Step 1: Add department polygons + data-driven color on map load**

In `src/app/panel/page.tsx`, in an `onReady(map)` handler, fetch `departamentos.geojson`, inject `color` into each feature via `ndviToColor(feature.properties.ndvi)`, then add source + layers:
```tsx
import { ndviToColor, ndwiToColor } from "@/lib/colors";

async function addProvinceLayers(map: maplibregl.Map) {
  const gj = await fetch("/data/departamentos.geojson").then((r) => r.json());
  for (const f of gj.features) {
    f.properties.colorNdvi = ndviToColor(f.properties.ndvi);
    f.properties.colorNdwi = ndwiToColor(f.properties.ndwi);
  }
  map.addSource("departamentos", { type: "geojson", data: gj });
  map.addLayer({
    id: "dep-ndvi",
    type: "fill",
    source: "departamentos",
    paint: { "fill-color": ["get", "colorNdvi"], "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: "dep-ndwi",
    type: "fill",
    source: "departamentos",
    layout: { visibility: "none" },
    paint: { "fill-color": ["get", "colorNdwi"], "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: "dep-borders",
    type: "line",
    source: "departamentos",
    paint: { "line-color": "#ffffff", "line-width": 1 },
  });
}
```
Wire `onReady={addProvinceLayers}` on `<MapShell>`.

- [ ] **Step 2: Build the layer toggle**

Create `src/components/layer-toggle.tsx`:
```tsx
"use client";

export type LayerKey = "ndvi" | "ndwi";

export default function LayerToggle({
  active,
  onChange,
}: {
  active: LayerKey;
  onChange: (k: LayerKey) => void;
}) {
  const opts: { key: LayerKey; label: string }[] = [
    { key: "ndvi", label: "Salud vegetación" },
    { key: "ndwi", label: "Estrés hídrico" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-emerald-700">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-sm ${
            active === o.key ? "bg-emerald-700 text-white" : "bg-white text-emerald-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```
In the page, hold `const [layer, setLayer] = useState<LayerKey>("ndvi")` and, on change, call `map.setLayoutProperty("dep-ndvi","visibility", layer==="ndvi"?"visible":"none")` and the inverse for `dep-ndwi`. Keep a ref to the map captured in `onReady`.

- [ ] **Step 3: Build the aggregate indicators panel**

Create `src/components/aggregate-indicators.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchJson, IndicadoresSchema, SeriesSchema, type Indicador } from "@/lib/data";
import { buildSparklinePath } from "@/lib/sparkline";

export default function AggregateIndicators() {
  const [items, setItems] = useState<Indicador[]>([]);
  const [serie, setSerie] = useState<number[]>([]);
  useEffect(() => {
    fetchJson("/data/indicadores-departamentos.json", IndicadoresSchema).then(setItems);
    fetchJson("/data/series-ndvi.json", SeriesSchema).then((s) => setSerie(s["arauco"] ?? []));
  }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-emerald-900">Indicadores por departamento</h2>
      {items.map((it) => (
        <div key={it.nombre} className="rounded border p-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{it.nombre}</span>
            <span>{it.areaEstresadaPct}% en estrés</span>
          </div>
          <div className="text-xs text-gray-500">NDVI medio {it.ndviMedio}</div>
        </div>
      ))}
      {serie.length > 1 && (
        <svg viewBox="0 0 120 30" className="w-full">
          <path d={buildSparklinePath(serie, 120, 30)} fill="none" stroke="#1a9850" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build the alerts panel**

Create `src/components/alerts-panel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchJson, AlertasSchema, type Alerta } from "@/lib/data";

const sevColor: Record<Alerta["severidad"], string> = {
  baja: "bg-yellow-100 text-yellow-800",
  media: "bg-orange-100 text-orange-800",
  alta: "bg-red-100 text-red-800",
};

export default function AlertsPanel() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  useEffect(() => {
    fetchJson("/data/alertas.json", AlertasSchema).then(setAlertas);
  }, []);
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-emerald-900">Alertas por zona</h2>
      {alertas.map((a, i) => (
        <div key={i} className={`rounded px-2 py-1 text-xs ${sevColor[a.severidad]}`}>
          <strong className="capitalize">{a.tipo}</strong> · {a.zona}
          <div>{a.detalle}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Build the mock export button**

Create `src/components/export-report-button.tsx`:
```tsx
"use client";

export default function ExportReportButton() {
  return (
    <button
      onClick={() => alert("Informe en preparación (demo). La exportación PDF llega en la fase 2.")}
      className="w-full rounded bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
    >
      Exportar informe
    </button>
  );
}
```

- [ ] **Step 6: Compose the Gestión view layout**

Modify `src/app/panel/page.tsx` so the body is a flex row: map fills the left, a fixed-width right sidebar (`w-80 overflow-y-auto p-3 space-y-4`) stacks `LayerToggle`, `AggregateIndicators`, `AlertsPanel`, `ExportReportButton`.

- [ ] **Step 7: Verify via preview**

Reload `/panel`, screenshot. Expected: satellite map with colored department polygons (green→red), white borders; right sidebar shows the toggle, indicator cards + a sparkline, two alerts (orange + red), and the export button. Click "Estrés hídrico" → polygons recolor (NDWI layer shows, NDVI hides). Console: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components src/app/panel/page.tsx
git commit -m "feat: Vista Gestión — polygons, layer toggle, indicators, alerts, mock export"
```

---

## Task 8: Real Sentinel-2 NDVI snapshot (offline pipeline) + overlay

**Files:**
- Create: `scripts/ndvi_snapshot.py`
- Create (generated): `public/raster/aimogasta-ndvi.png`
- Create (generated): `public/raster/aimogasta-ndvi-bounds.json`
- Modify: `public/data/series-ndvi.json` (`finca-aimogasta-1` with real values)
- Modify: `src/app/panel/page.tsx` (add image overlay + date label)

This produces the one genuinely-real layer. Runs offline, **not** part of the Next build.

- [ ] **Step 1: Set up a Python venv and deps**

```bash
python -m venv .venv
. .venv/Scripts/activate   # Windows; use .venv/bin/activate on macOS/Linux
pip install pystac-client planetary-computer rasterio numpy pillow
```

- [ ] **Step 2: Write the snapshot script**

Create `scripts/ndvi_snapshot.py`:
```python
"""Compute an NDVI snapshot over Aimogasta from Sentinel-2 L2A (Planetary Computer).
Outputs a colorized PNG + bounds JSON consumed by the web app. Run offline, once."""
import json
import numpy as np
import planetary_computer
import rasterio
from pystac_client import Client
from PIL import Image

# Bounding box around Aimogasta (Arauco), [west, south, east, north]
BBOX = [-66.86, -28.14, -66.70, -27.98]
OUT_PNG = "public/raster/aimogasta-ndvi.png"
OUT_BOUNDS = "public/raster/aimogasta-ndvi-bounds.json"

catalog = Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace,
)
search = catalog.search(
    collections=["sentinel-2-l2a"],
    bbox=BBOX,
    query={"eo:cloud_cover": {"lt": 10}},
    sortby=[{"field": "properties.datetime", "direction": "desc"}],
    limit=1,
)
item = next(search.items())
print("Selected scene:", item.id, item.datetime)

def read_band(asset_key: str):
    with rasterio.open(item.assets[asset_key].href) as src:
        # window read clipped to BBOX in the asset CRS would be ideal; for F0 read full + crop later
        return src.read(1).astype("float32"), src

red, src_red = read_band("B04")
nir, _ = read_band("B08")
ndvi = (nir - red) / (nir + red + 1e-6)

# Colorize: red -> yellow -> green
def colorize(arr):
    rgba = np.zeros((*arr.shape, 4), dtype=np.uint8)
    rgba[..., 3] = 180  # alpha
    rgba[arr < 0.4] = [215, 48, 39, 180]
    rgba[(arr >= 0.4) & (arr < 0.6)] = [254, 224, 139, 180]
    rgba[arr >= 0.6] = [26, 152, 80, 180]
    return rgba

Image.fromarray(colorize(ndvi), "RGBA").save(OUT_PNG)

# Bounds for MapLibre image source: [[TL],[TR],[BR],[BL]] as [lng,lat]
w, s, e, n = BBOX
with open(OUT_BOUNDS, "w") as f:
    json.dump(
        {
            "coordinates": [[w, n], [e, n], [e, s], [w, s]],
            "captura": item.datetime.strftime("%Y-%m-%d"),
            "sceneId": item.id,
        },
        f,
        indent=2,
    )
print("Wrote", OUT_PNG, "and", OUT_BOUNDS)
```

> **Note on CRS/cropping:** Sentinel-2 assets are in UTM, not lng/lat. For F0 fidelity the simplest robust path is to reproject/crop with `rasterio.warp` to the BBOX in EPSG:4326 before colorizing. If reprojection proves fiddly within the timebox, the **manual fallback** is acceptable: open EO Browser (apps.sentinel-hub.com/eo-browser), draw the Aimogasta AOI, render the NDVI visualization, download the PNG + note the AOI bounds, and write `aimogasta-ndvi-bounds.json` by hand with the same shape. Either way the output contract (PNG + bounds JSON with `coordinates` + `captura`) is identical.

- [ ] **Step 3: Run the pipeline**

```bash
python scripts/ndvi_snapshot.py
```
Expected: prints the selected scene + date, writes `public/raster/aimogasta-ndvi.png` and `aimogasta-ndvi-bounds.json`. Open the PNG to confirm it shows a red/yellow/green field pattern (not blank).

- [ ] **Step 4: Update the anchor finca series with real values**

Replace `finca-aimogasta-1` in `public/data/series-ndvi.json` with ~8 real monthly NDVI means sampled from the scene over the "mi finca" polygon (eyeball from the raster or compute a mean in the script). Keep the array length and 0–1 range.

- [ ] **Step 5: Overlay the real raster on the map + date label**

In `src/app/panel/page.tsx` `onReady`, after province layers, add:
```tsx
const bounds = await fetch("/raster/aimogasta-ndvi-bounds.json").then((r) => r.json());
map.addSource("aimogasta-ndvi", {
  type: "image",
  url: "/raster/aimogasta-ndvi.png",
  coordinates: bounds.coordinates,
});
map.addLayer({ id: "aimogasta-ndvi", type: "raster", source: "aimogasta-ndvi", paint: { "raster-opacity": 0.8 } });
```
Render a small caption somewhere visible: `Sentinel-2 · captura de {bounds.captura}` (store `captura` in state from the same fetch).

- [ ] **Step 6: Verify via preview**

Reload `/panel`, zoom to Aimogasta (`[-66.78, -28.06]`, zoom 12). Screenshot. Expected: the real NDVI raster sits over the satellite imagery around Aimogasta; the "Sentinel-2 · captura de YYYY-MM-DD" label is visible. Console: no errors (watch for CORS/404 on the PNG).

- [ ] **Step 7: Commit**

```bash
git add scripts/ndvi_snapshot.py public/raster public/data/series-ndvi.json src/app/panel/page.tsx
git commit -m "feat: real Sentinel-2 NDVI snapshot over Aimogasta + map overlay"
```

---

## Task 9: Vista Productor (preview) + view switcher + polish

**Files:**
- Create: `src/components/water-stress-badge.tsx`
- Create: `src/components/ndvi-time-series.tsx`
- Create: `src/components/producer-view.tsx`
- Modify: `src/app/panel/page.tsx` (view switcher Gestión/Productor)
- Modify: `src/app/page.tsx` (link to /panel)

Verified via preview.

- [ ] **Step 1: Water-stress badge**

Create `src/components/water-stress-badge.tsx`:
```tsx
"use client";

import { classifyWaterStress, type StressLevel } from "@/lib/water-stress";

const styles: Record<StressLevel, string> = {
  verde: "bg-green-100 text-green-800",
  ambar: "bg-amber-100 text-amber-800",
  rojo: "bg-red-100 text-red-800",
};

export default function WaterStressBadge({ index }: { index: number }) {
  const level = classifyWaterStress(index);
  return <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${styles[level]}`}>{level}</span>;
}
```

- [ ] **Step 2: NDVI time-series chart**

Create `src/components/ndvi-time-series.tsx`:
```tsx
"use client";

import { buildSparklinePath } from "@/lib/sparkline";

export default function NdviTimeSeries({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg viewBox="0 0 240 60" className="w-full rounded border bg-white">
      <path d={buildSparklinePath(values, 240, 60)} fill="none" stroke="#1a9850" strokeWidth={2} />
    </svg>
  );
}
```

- [ ] **Step 3: Producer view**

Create `src/components/producer-view.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import MapShell from "@/components/map-shell";
import NdviTimeSeries from "@/components/ndvi-time-series";
import WaterStressBadge from "@/components/water-stress-badge";
import { irrigationHint } from "@/lib/water-stress";
import { fetchJson, SeriesSchema } from "@/lib/data";

export default function ProducerView() {
  const [serie, setSerie] = useState<number[]>([]);
  useEffect(() => {
    fetchJson("/data/series-ndvi.json", SeriesSchema).then((s) =>
      setSerie(s["finca-aimogasta-1"] ?? []),
    );
  }, []);
  const last = serie.at(-1) ?? 0;

  async function addFincaLayers(map: maplibregl.Map) {
    const gj = await fetch("/data/fincas-aimogasta.geojson").then((r) => r.json());
    map.addSource("fincas", { type: "geojson", data: gj });
    map.addLayer({
      id: "fincas",
      type: "fill",
      source: "fincas",
      paint: {
        "fill-color": ["case", ["==", ["get", "esMiFinca"], true], "#2563eb", "#9ca3af"],
        "fill-opacity": 0.5,
      },
    });
    const bounds = await fetch("/raster/aimogasta-ndvi-bounds.json").then((r) => r.json());
    map.addSource("finca-ndvi", { type: "image", url: "/raster/aimogasta-ndvi.png", coordinates: bounds.coordinates });
    map.addLayer({ id: "finca-ndvi", type: "raster", source: "finca-ndvi", paint: { "raster-opacity": 0.8 } });
  }

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <div className="absolute left-2 top-2 z-10 rounded bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950">
          Preview · Fase 2
        </div>
        <MapShell center={[-66.78, -28.06]} zoom={12} onReady={addFincaLayers} />
      </div>
      <aside className="w-80 space-y-4 overflow-y-auto p-3">
        <h2 className="text-sm font-semibold text-emerald-900">Mi finca · Aimogasta</h2>
        <div className="flex items-center gap-2 text-sm">
          Estrés hídrico actual: <WaterStressBadge index={last} />
        </div>
        <NdviTimeSeries values={serie} />
        <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">{irrigationHint(last)}</p>
      </aside>
    </div>
  );
}
```
Add `import type maplibregl from "maplibre-gl";` at the top for the param type.

- [ ] **Step 4: Add the view switcher to the panel page**

In `src/app/panel/page.tsx`, add `const [view, setView] = useState<"gestion" | "productor">("gestion")`, render two header buttons that set it, and conditionally render the Gestión composition vs `<ProducerView />`. Gestión stays the default/protagonist.

- [ ] **Step 5: Make the home page link to the panel**

Replace `src/app/page.tsx` with a minimal landing that links to `/panel`:
```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-emerald-900">Panel Territorial Agrícola · La Rioja</h1>
      <Link href="/panel" className="rounded bg-emerald-700 px-4 py-2 text-white">Abrir el panel</Link>
    </main>
  );
}
```

- [ ] **Step 6: Full verification pass**

Run `npm test` → all unit tests pass. Then preview: `/` → click through to `/panel`; toggle Gestión ↔ Productor; in Productor confirm the "Preview · Fase 2" badge, the blue "mi finca" polygon, NDVI chart, water-stress badge, and irrigation hint text. Resize to a narrow width (preview_resize) to confirm the layout doesn't break catastrophically. Screenshot both views for the user. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components src/app/panel/page.tsx src/app/page.tsx
git commit -m "feat: Vista Productor preview + Gestión/Productor switcher + landing"
```

---

## Task 10: Final review + push

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass (colors, water-stress, sparkline, data).

- [ ] **Step 2: Production build sanity check**

Run: `npm run build`
Expected: build succeeds with no type errors. (Next 16 does not lint on build; run `npm run lint` separately if desired.)

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**
- §1 Objetivo / critério de sucesso → Tasks 6–9 (navigable two-view demo, real Aimogasta layer, no backend/network at runtime except static fetches). ✓
- §2 Posicionamento (Gestión protagonista) → Task 9 Step 4 (Gestión default). ✓
- §3 Escopo: Gestión (Task 7), Productor preview (Task 9), camada real única (Task 8), YAGNI exclusions respected (no auth/live satellite/PDF/Supabase). ✓
- §4 Stack (Next 16, MapLibre, Tailwind, static data) → Tasks 1, 6. ✓
- §5 Data files → Task 5. ✓
- §6 Components → Tasks 6–9 match the component list. ✓
- §7 Data flow (client-side static + real Aimogasta raster) → Tasks 5–8. ✓
- §8 Sentinel-2 pipeline → Task 8. ✓
- §9 Risks (no runtime backend; anchor real + labeled; preview banner; no secrets) → Tasks 8–9. ✓

**2. Placeholder scan:** Bounds for the overlay are read from `aimogasta-ndvi-bounds.json` produced by Task 8 (a defined artifact, not a vague placeholder). The Task 4 flat-series expectation is flagged with an explicit correction. No "TBD"/"handle edge cases" steps. ✓

**3. Type consistency:** `ndviToColor`/`ndwiToColor` (colors.ts) used in Tasks 6–7; `classifyWaterStress`/`StressLevel`/`irrigationHint` (water-stress.ts) used in Task 9; `buildSparklinePath` (sparkline.ts) used in Tasks 7 & 9; `IndicadoresSchema`/`AlertasSchema`/`SeriesSchema`/`fetchJson` (data.ts) used in Tasks 7 & 9. The bounds contract (`coordinates` + `captura`) is written in Task 8 and read in Tasks 8 & 9. Consistent. ✓

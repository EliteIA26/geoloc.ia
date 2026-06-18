# Incremento 4 — Navegação temporal + estrés hídrico fluido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users browse the last ~6 Sentinel-2 NDVI scenes over Aimogasta by date (cloud ≤60%, honest cloud badges), and make the "Estrés hídrico" toggle a continuous MODIS moisture (NDWI) raster like the NDVI one.

**Architecture:** `ndvi_snapshot.py` becomes an incremental multi-date pipeline emitting one small PNG per scene + an `aimogasta-series.json` manifest; `modis_ndvi.py` also emits a province NDWI raster + per-dept means. The Productor view gets a `ScenePicker` (date chips) that swaps the finca raster via `ImageSource.updateImage`; the Gestión toggle swaps between the NDVI and NDWI province rasters. All graceful if assets are missing.

**Tech Stack:** Python (rasterio/pystac-client/planetary-computer/numpy/Pillow — `.venv` cached) reusing `scripts/s2_common.py`; TypeScript, Zod, Vitest; Next 16 + Tailwind 4 + MapLibre v5 (`ImageSource.updateImage` confirmed).

---

## Task 1: Lib — Aimogasta series schema/loader + deptosNdwi (TDD)

**Files:** Modify `src/lib/satelital.ts`, `src/lib/satelital.test.ts`

- [ ] **Step 1: Failing tests**
Append to `src/lib/satelital.test.ts`:
```ts
import { AimogastaSerieSchema, ProvinciaNdviSchema } from "./satelital";

describe("AimogastaSerieSchema", () => {
  it("parses the scene list", () => {
    const v = AimogastaSerieSchema.parse({
      escenas: [{ fecha: "2026-05-24", nubes: 6.7, png: "aimogasta-ndvi-2026-05-24.png", coordinates: [[-66.8,-27.7],[-66.7,-27.7],[-66.7,-27.9],[-66.8,-27.9]] }],
    });
    expect(v.escenas[0].fecha).toBe("2026-05-24");
  });
});
describe("ProvinciaNdviSchema deptosNdwi", () => {
  it("accepts optional deptosNdwi", () => {
    expect(() => ProvinciaNdviSchema.parse({ fecha: "2026-05-25", deptos: { Arauco: 0.4 }, deptosNdwi: { Arauco: 0.1 } })).not.toThrow();
    expect(() => ProvinciaNdviSchema.parse({ fecha: "2026-05-25", deptos: { Arauco: 0.4 } })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → fail** — `npm test -- satelital` (AimogastaSerieSchema missing).

- [ ] **Step 3: Implement (append to `src/lib/satelital.ts`)**
```ts
export const AimogastaSerieSchema = z.object({
  escenas: z.array(
    z.object({
      fecha: z.string(),
      nubes: z.number(),
      png: z.string(),
      coordinates: z.array(z.array(z.number())),
    }),
  ),
});
export type AimogastaSerie = z.infer<typeof AimogastaSerieSchema>;
export type Escena = AimogastaSerie["escenas"][number];

export async function fetchAimogastaSeries(): Promise<AimogastaSerie | null> {
  try {
    const res = await fetch("/data/aimogasta-series.json");
    if (!res.ok) return null;
    return AimogastaSerieSchema.parse(await res.json());
  } catch {
    return null;
  }
}
```
And in the existing `ProvinciaNdviSchema`, add `deptosNdwi: z.record(z.string(), z.number()).optional(),`.

- [ ] **Step 4: Run → pass.** `npm test -- satelital`.
- [ ] **Step 5: Commit** — `git add src/lib/satelital.ts src/lib/satelital.test.ts && git commit -m "feat: Aimogasta scene-series loader + optional deptosNdwi (TDD)"`

---

## Task 2: ScenePicker component

**Files:** Create `src/components/scene-picker.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";

import type { Escena } from "@/lib/satelital";

function fechaCorta(f: string): string {
  const d = new Date(f + "T00:00:00");
  return Number.isNaN(d.getTime()) ? f : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
function nubeTone(n: number): string {
  return n < 10 ? "text-emerald-700" : n < 40 ? "text-amber-700" : "text-red-700";
}

export default function ScenePicker({
  escenas, selected, onSelect,
}: { escenas: Escena[]; selected: string; onSelect: (fecha: string) => void }) {
  if (escenas.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] ed-faint">Imagen satelital · elegí la fecha</div>
      <div className="flex flex-wrap gap-1.5">
        {escenas.map((e) => (
          <button
            key={e.fecha}
            type="button"
            onClick={() => onSelect(e.fecha)}
            className={`rounded-full border px-2.5 py-1 text-[12px] ${
              selected === e.fecha ? "border-[var(--accent)] bg-emerald-50 text-emerald-900" : "border-[var(--hairline)] ed-soft"
            }`}
          >
            {fechaCorta(e.fecha)} <span className={nubeTone(e.nubes)}>· {Math.round(e.nubes)}% nub.</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build** — `npm run build` clean.
- [ ] **Step 3: Commit** — `git add src/components/scene-picker.tsx && git commit -m "feat: ScenePicker date chips with cloud badge"`

---

## Task 3: Pipeline — multi-date Aimogasta (incremental, cloud ≤60%)  [opus]

**Files:** Modify `scripts/ndvi_snapshot.py`; generates `public/raster/aimogasta-ndvi-<fecha>.png` (per scene) + `public/data/aimogasta-series.json`; keeps `aimogasta-ndvi.png`/`-bounds.json` as the latest alias.

- [ ] **Step 1: Refactor to a per-scene processor + incremental loop**
Extract the existing NDVI logic into `process_scene(item) -> (png_path, coordinates, ndvi_mean)` writing `aimogasta-ndvi-<YYYY-MM-DD>.png`. Then:
```python
MAX_CLOUD = 60
WINDOW = 6
SERIES_PATH = os.path.join(ROOT, "public", "data", "aimogasta-series.json")

def load_manifest():
    if os.path.exists(SERIES_PATH):
        try:
            return json.load(open(SERIES_PATH, encoding="utf-8")).get("escenas", [])
        except Exception:
            return []
    return []

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    existing = {e["fecha"]: e for e in load_manifest()}
    items = s2.find_scenes(BBOX, MGRS_TILE, max_cloud=MAX_CLOUD, limit=15)[:WINDOW]
    escenas = []
    for item in items:
        fecha = item.datetime.strftime("%Y-%m-%d")
        nubes = round(float(item.properties.get("eo:cloud_cover", 0)), 1)
        png_name = f"aimogasta-ndvi-{fecha}.png"
        png_path = os.path.join(OUT_DIR, png_name)
        if fecha in existing and os.path.exists(png_path):
            coords = existing[fecha]["coordinates"]   # reuse, don't re-download
        else:
            _, coords, _ = process_scene(item, png_path)  # downloads + writes the dated PNG
        escenas.append({"fecha": fecha, "nubes": nubes, "png": png_name, "coordinates": coords})
    # newest first
    escenas.sort(key=lambda e: e["fecha"], reverse=True)
    escenas = escenas[:WINDOW]
    # latest alias for the Gestión overlay (unchanged consumers)
    latest = escenas[0]
    import shutil
    shutil.copyfile(os.path.join(OUT_DIR, latest["png"]), PNG_PATH)
    json.dump({"coordinates": latest["coordinates"], "captura": latest["fecha"], "nubes": latest["nubes"]},
              open(BOUNDS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump({"escenas": escenas}, open(SERIES_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    # prune PNGs no longer in the window
    keep = {e["png"] for e in escenas} | {"aimogasta-ndvi.png", "larioja-ndvi.png", "larioja-ndwi.png"}
    for fn in os.listdir(OUT_DIR):
        if fn.startswith("aimogasta-ndvi-") and fn.endswith(".png") and fn not in keep:
            try: os.remove(os.path.join(OUT_DIR, fn))
            except OSError: pass
    print(f"series: {[e['fecha']+f' ({e[\"nubes\"]}%)' for e in escenas]}")
```
`process_scene` must download B04/B08 for that item (each its own temp dir), reproject, NDVI (BOA offset), colorize, save to the given `png_path`, return `(png_path, coordinates, mean)`. (`coordinates` = the MapLibre [TL,TR,BR,BL] order as today.)

- [ ] **Step 2: Run** — `. .venv/Scripts/activate && python scripts/ndvi_snapshot.py`. Expected: prints ~6 dates with their cloud% (24-may 6.7%, 03-jun 27%, 10-jun 48%, …), writes the dated PNGs + `aimogasta-series.json` + the latest alias. Cloudy scenes will show cloud artifacts in the NDVI — expected; the UI badges the cloud%.

- [ ] **Step 3: Commit** — `git add scripts/ndvi_snapshot.py public/raster/ public/data/aimogasta-series.json && git commit -m "feat: incremental multi-date Aimogasta NDVI series (cloud<=60%) + manifest"`

> If downloads fail, report BLOCKED — do NOT fabricate.

---

## Task 4: Pipeline — MODIS NDWI (humedad) province raster  [opus]

**Files:** Modify `scripts/modis_ndvi.py`; generates `public/raster/larioja-ndwi.png` + adds `deptosNdwi` to `public/data/provincia-ndvi.json`

- [ ] **Step 1: Verify the MODIS reflectance assets**
```bash
. .venv/Scripts/activate
python -c "import planetary_computer,pystac_client; c=pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1',modifier=planetary_computer.sign_inplace); it=next(c.search(collections=['modis-13Q1-061'],bbox=[-69.6,-32.0,-65.4,-27.7],limit=1).items()); print([k for k in it.assets if 'reflectance' in k])"
```
Confirm the NIR + MIR asset keys (expected `250m_16_days_NIR_reflectance`, `250m_16_days_MIR_reflectance`) and scale (0.0001).

- [ ] **Step 2: Add humedad to `modis_ndvi.py`**
After computing/saving the NDVI raster + the NDVI zonal means, read the NIR + MIR bands (same item, same reproject grid/`read_band_to_4326`), compute `ndwi = (nir - mir) / (nir + mir)` on reflectance (apply nodata mask), colorize with the SAME 5-stop ramp, save `public/raster/larioja-ndwi.png`. Compute per-dept zonal means the same way and write them into `provincia-ndvi.json` under `deptosNdwi` (merge with the existing `{fecha, deptos}`). Keep `larioja-ndvi-bounds.json` valid for both rasters (same grid/bbox).

- [ ] **Step 3: Run + sanity** — `python scripts/modis_ndvi.py`. Expected: `larioja-ndwi.png` (smooth fade) + `provincia-ndvi.json` now has `deptosNdwi` (~18 entries). NDWI/humedad values typically lower/narrower than NDVI; that's fine.

- [ ] **Step 4: Commit** — `git add scripts/modis_ndvi.py public/raster/larioja-ndwi.png public/data/provincia-ndvi.json && git commit -m "feat: province MODIS moisture (NDWI) raster + per-dept means"`

> If the NIR/MIR assets aren't present under those names, use the confirmed names from Step 1; if unavailable, report BLOCKED (don't fabricate).

---

## Task 5: UI — Productor scene picker + raster swap; Gestión NDWI fluid

**Files:** Modify `src/components/producer-view.tsx`, `src/app/panel/page.tsx`

- [ ] **Step 1: Productor — load series, mount picker, swap raster**
In `producer-view.tsx`: add `const mapRef = useRef<maplibregl.Map | null>(null)`, store the map in `addFincaLayers` (`mapRef.current = map`). Load the series: `const [serieSat, setSerieSat] = useState<AimogastaSerie | null>(null)` + effect `fetchAimogastaSeries().then(setSerieSat)`. Add `const [fecha, setFecha] = useState<string | null>(null)`; default it to `serieSat?.escenas[0]?.fecha` once loaded (in the same `.then`: `setSerieSat(s); setFecha(s?.escenas[0]?.fecha ?? null)` — set both inside the `.then`, lint-safe). In `addFincaLayers`, add the finca raster from `escenas[0]` (or skip if none). Add an effect on `[fecha]` that swaps the image:
```tsx
useEffect(() => {
  const map = mapRef.current;
  if (!map || !serieSat || !fecha) return;
  const esc = serieSat.escenas.find((e) => e.fecha === fecha);
  const src = map.getSource("finca-ndvi") as maplibregl.ImageSource | undefined;
  if (esc && src) src.updateImage({ url: `/raster/${esc.png}`, coordinates: esc.coordinates as [number,number][] });
}, [fecha, serieSat]);
```
Render `<ScenePicker escenas={serieSat?.escenas ?? []} selected={fecha ?? ""} onSelect={setFecha} />` near the finca title, and show the selected scene's cloud% in the label (e.g. under the title: "Sentinel-2 · {fecha} · {nubes}% nubes").

- [ ] **Step 2: Gestión — NDWI fluid toggle**
In `page.tsx` `handleReady`, after the `larioja-ndvi` raster, also add the moisture raster (defensive):
```tsx
try {
  const nb = await fetch("/raster/larioja-ndwi.png", { method: "HEAD" }).then((r) => r.ok).catch(() => false);
  if (nb) {
    map.addSource("larioja-ndwi", { type: "image", url: "/raster/larioja-ndwi.png", coordinates: lb.coordinates });
    map.addLayer({ id: "larioja-ndwi", type: "raster", source: "larioja-ndwi", layout: { visibility: "none" }, paint: { "raster-opacity": 0.8 } });
  }
} catch { /* skip */ }
```
(`lb` = the larioja-ndvi-bounds coordinates already fetched.) Update `handleToggle`: NDVI → `larioja-ndvi` visible, `larioja-ndwi` + `dep-ndwi` hidden; NDWI → `larioja-ndwi` visible, `larioja-ndvi` + `dep-ndwi` hidden (guard each with `getLayer`). The near-transparent `dep-ndvi` click layer stays visible always.

- [ ] **Step 3: Verify (controller) + build/lint**
`npm run build` clean, `npm run lint` clean (the series/`fecha` setState is inside `.then`/event handlers, not synchronous in an effect body).

- [ ] **Step 4: Commit** — `git add src/components/producer-view.tsx src/app/panel/page.tsx && git commit -m "feat: Productor scene picker (date nav) + Gestión fluid NDWI toggle"`

---

## Task 6: Final verification

- [ ] **Step 1:** `npm test` (all pass), `npm run lint` (clean), `npm run build` (clean) — with the dev server stopped.
- [ ] **Step 2 (controller):** `npm run dev` → Productor: date chips switch the finca NDVI raster + show cloud%; Gestión: "Estrés hídrico" shows the fluid moisture raster, "Salud vegetación" the NDVI. Confirm graceful if a raster/manifest is absent. Stop the server.
- [ ] **Step 3:** The daily cron already runs `ndvi_snapshot.py` + `modis_ndvi.py`, so the series + NDWI refresh automatically — no workflow change needed.

---

## Self-Review

**1. Spec coverage:** multi-date Aimogasta + manifest (Task 3) + loader (Task 1) + picker (Task 2) + swap (Task 5.1); NDWI fluid (Task 4 + Task 5.2); cloud ≤60% (Task 3); graceful (loaders return null, UI guards). ✓
**2. Placeholder scan:** Task 4 Step 1 verifies MODIS reflectance assets (real step); pipeline tasks carry BLOCKED-not-fabricate. No "TBD". The `process_scene` refactor is described with its exact contract.
**3. Type consistency:** `AimogastaSerie`/`Escena`/`fetchAimogastaSeries` (Task 1) → ScenePicker (Task 2) + Productor (Task 5). Manifest shape written by Task 3 (`{escenas:[{fecha,nubes,png,coordinates}]}`) matches `AimogastaSerieSchema`. `deptosNdwi` (Task 1 schema) written by Task 4, optional. `larioja-ndwi.png` (Task 4) consumed by Task 5.2. `ImageSource.updateImage({url,coordinates})` confirmed (MapLibre v5). Consistent.

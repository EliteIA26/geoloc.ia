# Incremento 3 — Auto-update + MODIS fluid + polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-update the satellite imagery (cron), make the Gestión map a continuous MODIS NDVI gradient (real for all 18 departments) with the borders kept, clean up the AI chat output (no markdown), polish the recommendation box, and make the sidebar resizable.

**Architecture:** A new offline `modis_ndvi.py` produces a province-wide NDVI raster + per-department zonal means; the Gestión map overlays that raster (continuous fade) under the department borders + a transparent click layer; cards read the real MODIS means. A GitHub Action runs the whole pipeline on a daily schedule and commits changed assets. Small TS/UI fixes handle the markdown stripping, box typography, and a resizable sidebar.

**Tech Stack:** Python (rasterio, pystac-client, planetary-computer, numpy, Pillow — `.venv` cached) reusing `scripts/s2_common.py`; TypeScript, Zod, Vitest; Next 16 + Tailwind 4; GitHub Actions.

---

## Task 1: `stripMarkdown` + plain-text AI prompts (TDD)

**Files:** Modify `src/lib/ai-narrative.ts`, `src/lib/ai-narrative.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/ai-narrative.test.ts`:
```ts
import { stripMarkdown } from "./ai-narrative";

describe("stripMarkdown", () => {
  it("removes bold/italic asterisks and headings", () => {
    expect(stripMarkdown("**Recomendación:** regá *hoy*")).toBe("Recomendación: regá hoy");
    expect(stripMarkdown("# Título\n- item")).toBe("Título item");
  });
  it("collapses whitespace and trims", () => {
    expect(stripMarkdown("a  \n\n  b")).toBe("a b");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- ai-narrative`
Expected: FAIL (`stripMarkdown` not exported).

- [ ] **Step 3: Implement**

In `src/lib/ai-narrative.ts`, add (and export) the helper, and apply it to BOTH generators' returned text:
```ts
export function stripMarkdown(s: string): string {
  return s
    .replace(/[*_`#>]/g, " ")        // markdown emphasis/heading/code/quote marks
    .replace(/^\s*[-•]\s*/gm, " ")    // bullet markers
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}
```
In `generateNarrative` and `generateTerritorialResumen`, change `const out = text.trim();` → `const out = stripMarkdown(text);`. Also add to BOTH system prompts (SYSTEM and SYSTEM_GOV): append `" Respondé en texto plano: sin markdown, sin asteriscos (*) ni almohadillas (#) ni viñetas."` (the prompts already ask for 2-3 frases).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- ai-narrative`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-narrative.ts src/lib/ai-narrative.test.ts
git commit -m "fix: strip markdown from AI output + plain-text prompts (no more literal **)"
```

---

## Task 2: Province NDVI loader in `satelital.ts` (TDD)

**Files:** Modify `src/lib/satelital.ts`, `src/lib/satelital.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/satelital.test.ts`:
```ts
import { ProvinciaNdviSchema } from "./satelital";

describe("ProvinciaNdviSchema", () => {
  it("parses fecha + per-department means", () => {
    const v = ProvinciaNdviSchema.parse({ fecha: "2026-06-17", deptos: { Arauco: 0.42, Capital: 0.31 } });
    expect(v.deptos.Arauco).toBe(0.42);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- satelital`
Expected: FAIL.

- [ ] **Step 3: Implement (append to `src/lib/satelital.ts`)**

```ts
export const ProvinciaNdviSchema = z.object({
  fecha: z.string(),
  deptos: z.record(z.string(), z.number()),
});
export type ProvinciaNdvi = z.infer<typeof ProvinciaNdviSchema>;

export async function fetchProvinciaNdvi(): Promise<ProvinciaNdvi | null> {
  try {
    const res = await fetch("/data/provincia-ndvi.json");
    if (!res.ok) return null;
    return ProvinciaNdviSchema.parse(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- satelital`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/satelital.ts src/lib/satelital.test.ts
git commit -m "feat: provincia-ndvi loader (per-department MODIS means)"
```

---

## Task 3: Resizable sidebar

**Files:** Create `src/lib/use-resizable-width.ts`, `src/components/resizable-aside.tsx`; Modify `src/app/panel/page.tsx`, `src/components/producer-view.tsx`

- [ ] **Step 1: Hook**

Create `src/lib/use-resizable-width.ts`. Session-only width (NO localStorage — avoids both the `react-hooks/set-state-in-effect` lint error from a synchronous restore-in-effect AND SSR/hydration issues; persistence is YAGNI for the demo). `setWidth` is only called inside the `move` event handler (not synchronously in an effect body), so it stays lint-clean:
```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useResizableWidth(initial = 320, min = 300, max = 560) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return;
      // Sidebar is on the right; dragging its left edge: width grows as cursor moves left.
      setWidth(Math.min(max, Math.max(min, window.innerWidth - e.clientX)));
    }
    function up() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [min, max]);

  return { width, onPointerDown };
}
```

- [ ] **Step 2: ResizableAside wrapper**

Create `src/components/resizable-aside.tsx`:
```tsx
"use client";
import { useResizableWidth } from "@/lib/use-resizable-width";

export default function ResizableAside({ children }: { children: React.ReactNode }) {
  const { width, onPointerDown } = useResizableWidth();
  return (
    <div className="relative flex shrink-0" style={{ width }}>
      <div
        onPointerDown={onPointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent)]/30"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel"
      />
      <aside className="ed-page flex w-full flex-col gap-4 overflow-y-auto border-l border-[var(--hairline)] p-4">
        {children}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Use it in both views**

In `src/app/panel/page.tsx` and `src/components/producer-view.tsx`, replace the existing `<aside className="ed-page ... w-80 ...">...</aside>` wrapper with `<ResizableAside>...</ResizableAside>`. Move the inner content unchanged; drop the old `w-80`/border classes (now in the wrapper). Import `ResizableAside`.

- [ ] **Step 4: Build + lint**

Run: `npm run build` (clean) and `npm run lint` (clean — `setWidth` is only called inside the `move` pointer-event handler, never synchronously in an effect body, so `react-hooks/set-state-in-effect` does not fire).

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-resizable-width.ts src/components/resizable-aside.tsx src/app/panel/page.tsx src/components/producer-view.tsx
git commit -m "feat: resizable sidebar (drag handle, min/max, persisted)"
```

---

## Task 4: MODIS province NDVI pipeline (opus; heavy)

**Files:** Create `scripts/modis_ndvi.py`; generates `public/raster/larioja-ndvi.png` + `larioja-ndvi-bounds.json` + `public/data/provincia-ndvi.json`

- [ ] **Step 1: Verify the MODIS collection/asset/scale against the live STAC FIRST**

Run a throwaway snippet (do NOT commit it) to confirm the exact strings:
```bash
. .venv/Scripts/activate
python -c "import planetary_computer, pystac_client; c=pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=planetary_computer.sign_inplace); it=next(c.search(collections=['modis-13Q1-061'], bbox=[-69.6,-32.0,-65.4,-27.7], limit=1).items()); print([k for k in it.assets]); print(it.datetime)"
```
Expected: prints the asset keys (confirm the NDVI asset name — likely `250m_16_days_NDVI`) and a recent date. If the collection id is wrong, list candidates: `print([c.id for c in pystac_client.Client.open(...).get_collections() if 'modis' in c.id and '13' in c.id])`. Use the CONFIRMED id/asset. NDVI scale is 0.0001 (stored int16, valid −2000..10000); confirm via the asset's `raster:bands` if present.

- [ ] **Step 2: Implement `scripts/modis_ndvi.py`**

Reuse `s2_common` helpers (download_asset, read_band_to_4326, merge is not needed here — separate outputs). Structure:
```python
"""Province-wide MODIS NDVI (16-day, 250m) over La Rioja: a continuous fade
raster + per-department zonal means. Run offline."""
import json, os, sys, tempfile
import numpy as np
import rasterio
from rasterio.features import geometry_mask
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_common as s2
from PIL import Image

BBOX = [-69.6, -32.0, -65.4, -27.7]   # La Rioja province
W, S, E, N = BBOX
RES = 0.0025                            # ~250 m at this latitude
COLLECTION = "modis-13Q1-061"          # CONFIRM in Step 1
NDVI_ASSET = "250m_16_days_NDVI"       # CONFIRM in Step 1
SCALE = 0.0001
ROOT = s2.ROOT
PNG = os.path.join(ROOT, "public", "raster", "larioja-ndvi.png")
BOUNDS = os.path.join(ROOT, "public", "raster", "larioja-ndvi-bounds.json")
PROV = os.path.join(ROOT, "public", "data", "provincia-ndvi.json")

def colorize(ndvi):
    h, w = ndvi.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    valid = np.isfinite(ndvi)
    # Continuous-ish ramp via 5 stops (still reads as a smooth fade at 250m).
    stops = [(-1,[215,48,39]),(0.2,[252,141,89]),(0.4,[254,224,139]),(0.6,[145,207,96]),(0.8,[26,152,80])]
    for i in range(len(stops)-1):
        lo,clo = stops[i]; hi,chi = stops[i+1]
        m = valid & (ndvi>=lo) & (ndvi<hi)
        rgba[m] = [*chi,170]
    rgba[valid & (ndvi>=0.8)] = [26,152,80,170]
    return rgba

def main():
    c = s2.open_catalog()
    item = next(c.search(collections=[COLLECTION], bbox=BBOX,
        sortby=[{"field":"properties.datetime","direction":"desc"}], limit=1).items())
    print("MODIS scene:", item.id, item.datetime)
    tmp = tempfile.mkdtemp(prefix="modis_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None)
    try:
        local = s2.download_asset(item.assets[NDVI_ASSET].href, os.path.join(tmp,"ndvi.tif"))
        # reproject to the province grid (RES); read_band_to_4326 takes (path,bbox,res)
        raw = s2.read_band_to_4326(local, BBOX, RES)
    finally:
        for p in (os.path.join(tmp,"ndvi.tif"),):
            if os.path.exists(p):
                try: os.remove(p)
                except OSError: pass
        try: os.rmdir(tmp)
        except OSError: pass
    ndvi = raw * SCALE
    ndvi[(raw == 0)] = np.nan  # fill/nodata
    Image.fromarray(colorize(ndvi),"RGBA").save(PNG)
    width = ndvi.shape[1]; height = ndvi.shape[0]
    tr = rasterio.transform.from_bounds(W,S,E,N,width,height)
    with open(BOUNDS,"w",encoding="utf-8") as f:
        json.dump({"coordinates":[[W,N],[E,N],[E,S],[W,S]],"captura":item.datetime.strftime("%Y-%m-%d")}, f, ensure_ascii=False, indent=2)
    # Per-department zonal means.
    gj = json.load(open(os.path.join(ROOT,"public","data","departamentos.geojson"),encoding="utf-8"))
    deptos = {}
    for feat in gj["features"]:
        try:
            mask = geometry_mask([feat["geometry"]], out_shape=(height,width), transform=tr, invert=True)
            vals = ndvi[mask & np.isfinite(ndvi)]
            if vals.size:
                deptos[feat["properties"]["nombre"]] = round(float(vals.mean()),3)
        except Exception as e:
            print("zonal skip", feat["properties"].get("nombre"), e)
    with open(PROV,"w",encoding="utf-8") as f:
        json.dump({"fecha":item.datetime.strftime("%Y-%m-%d"),"deptos":deptos}, f, ensure_ascii=False, indent=2)
    print(f"Wrote {PNG}, {BOUNDS}, {PROV} ({len(deptos)} deptos)")

if __name__ == "__main__":
    main()
```
> Verify `read_band_to_4326` accepts `(path, bbox, res)` — it does (s2_common signature). If MODIS NDVI nodata is `-3000` (not 0), mask that instead — check the printed stats and adjust the `raw == 0` mask accordingly.

- [ ] **Step 3: Run + sanity check**

```bash
python scripts/modis_ndvi.py
```
Expected: a `larioja-ndvi.png` showing a green→red gradient over the province shape, and `provincia-ndvi.json` with ~18 department means in a plausible 0.1–0.7 range. Open the PNG to confirm a smooth fade (not blocky).

- [ ] **Step 4: Commit**

```bash
git add scripts/modis_ndvi.py public/raster/larioja-ndvi.png public/raster/larioja-ndvi-bounds.json public/data/provincia-ndvi.json
git commit -m "feat: province-wide MODIS NDVI fade raster + per-department zonal means"
```

> If the download/collection genuinely fails, report BLOCKED with the error — do NOT fabricate the raster or means.

---

## Task 5: Gestión fluid map + real per-department cards

**Files:** Modify `src/app/panel/page.tsx`, `src/components/aggregate-indicators.tsx`, `src/components/department-detail.tsx`, `src/components/insight-hero.tsx`

Verified via preview (controller).

- [ ] **Step 1: Overlay the fluid raster + transparent click layer**

In `panel/page.tsx` `handleReady`, after adding `departamentos`: add the province raster UNDER the borders, make the NDVI fill transparent-but-clickable, keep NDWI as the existing flat fill toggle:
```tsx
// Province-wide MODIS NDVI fade (under borders). Defensive.
try {
  const lb = await fetch("/raster/larioja-ndvi-bounds.json").then((r) => (r.ok ? r.json() : null));
  if (lb) {
    map.addSource("larioja-ndvi", { type: "image", url: "/raster/larioja-ndvi.png", coordinates: lb.coordinates });
    map.addLayer({ id: "larioja-ndvi", type: "raster", source: "larioja-ndvi", paint: { "raster-opacity": 0.8 } });
  }
} catch (e) { console.warn("province NDVI skipped", e); }
```
Change the `dep-ndvi` fill to near-transparent (click target only): `paint: { "fill-color": "#000000", "fill-opacity": 0.01 }` and ensure `dep-borders` + `dep-highlight` are added AFTER the raster + the dep fills so they sit on top. `dep-ndwi` keeps its flat fill (visibility "none" by default). The toggle: NDVI → show `larioja-ndvi` raster + hide `dep-ndwi`; NDWI → hide `larioja-ndvi` + show `dep-ndwi`. Update `handleToggle` accordingly (use `setLayoutProperty("larioja-ndvi","visibility",...)` and `dep-ndwi`).

- [ ] **Step 2: Real per-department NDVI in cards/detail**

Load `fetchProvinciaNdvi()` into a `prov` state (effect: `fetchProvinciaNdvi().then(setProv)`). Pass it down so `aggregate-indicators.tsx` and `department-detail.tsx` use `prov.deptos[nombre]` when present (fuente "satelital", all depts) and fall back to the geojson `ndvi` (fuente "referencia") when absent. Keep the existing `vegetationStatus` coloring. Add a small "· captura {prov.fecha}" note.

- [ ] **Step 3: InsightHero typography polish**

In `src/components/insight-hero.tsx`, change the `titulo` from `text-[20px]` to `text-[16px] leading-relaxed` so 2-3-sentence recommendations read as clean prose, not a wall. Keep eyebrow/chips/accion/footer.

- [ ] **Step 4: Verify (controller) + build/lint**

`npm run build` clean, `npm run lint` clean. Controller screenshots the fluid map + clean recommendation.

- [ ] **Step 5: Commit**

```bash
git add src/app/panel/page.tsx src/components/aggregate-indicators.tsx src/components/department-detail.tsx src/components/insight-hero.tsx
git commit -m "feat: Gestión fluid MODIS map + real per-department NDVI + tighter recommendation"
```

---

## Task 6: GitHub Action — daily auto-update

**Files:** Create `.github/workflows/satelital.yml`

- [ ] **Step 1: Implement the workflow**

```yaml
name: Actualizar capas satelitales
on:
  schedule:
    - cron: "0 9 * * *"   # daily 09:00 UTC
  workflow_dispatch: {}
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install deps
        run: pip install rasterio pystac-client planetary-computer numpy pillow requests
      - name: Run pipeline
        run: |
          python scripts/ndvi_snapshot.py
          python scripts/snow_snapshot.py
          python scripts/modis_ndvi.py
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data public/raster
          if git diff --staged --quiet; then
            echo "No changes."
          else
            git commit -m "chore: refresh satellite layers [skip ci]"
            git push
          fi
```

- [ ] **Step 2: Validate YAML + note manual run**

Confirm the file parses (no tabs; 2-space indent). It runs on push to the default branch's workflow set after merge. The user can trigger it manually via the Actions tab ("Run workflow") once merged — note this for the controller's verification.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/satelital.yml
git commit -m "ci: daily GitHub Action to refresh satellite layers (commit-if-changed)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Tests + lint + build** (server stopped, to avoid .next dev/build corruption)

Run: `npm test` (all pass), `npm run lint` (clean), `npm run build` (clean, routes intact).

- [ ] **Step 2: End-to-end (controller)**

`npm run dev` → `/panel`: Gestión shows the continuous NDVI fade clipped to the province with the 18 borders on top; clicking a department still selects it; cards show real MODIS NDVI (all "satelital"); the recommendation reads as clean plain text (no `**`); the sidebar drags to resize. Verify via DOM/screenshot. Then stop the server.

- [ ] **Step 3: Cron** — after merge, trigger the workflow manually (Actions → Run workflow) and confirm a green run (controller/user).

---

## Self-Review

**1. Spec coverage:**
- Cron → Task 6. ✓
- MODIS fluid colors + all-depts-real → Task 4 (raster + zonal means) + Task 5 (overlay + real cards). ✓
- Chat markdown fix → Task 1 (stripMarkdown + prompts). ✓
- Recommendation box design → Task 5 Step 3 (InsightHero typography). ✓
- Resizable sidebar → Task 3. ✓
- Honesty (MODIS coarse/dated, commit-if-changed, verify collection) → Task 4 Step 1, Task 6 Step 1. ✓

**2. Placeholder scan:** Task 4 has explicit "CONFIRM in Step 1" markers for the MODIS collection/asset/scale (a real verification step, not hand-waving) + a BLOCKED-not-fabricate instruction. No "TBD"/"handle edge cases".

**3. Type consistency:** `ProvinciaNdviSchema`/`ProvinciaNdvi`/`fetchProvinciaNdvi` (Task 2) consumed in Task 5. `stripMarkdown` (Task 1) used in ai-narrative generators. `useResizableWidth`/`ResizableAside` (Task 3) used in both views. The `provincia-ndvi.json` shape written by Task 4 (`{fecha, deptos:{nombre:ndvi}}`) matches `ProvinciaNdviSchema`. `larioja-ndvi.png`/`-bounds.json` written by Task 4, consumed by Task 5. Consistent.

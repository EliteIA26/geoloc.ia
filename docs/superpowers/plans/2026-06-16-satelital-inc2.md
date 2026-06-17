# Camadas Satelitais (Incremento 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three real Sentinel-2 snapshot layers — NDMI (vegetation moisture) and an NDVI trend over Aimogasta, plus snow cover over the Sierra de Famatina — surfaced as digested signals in the editorial panel.

**Architecture:** A consolidated `public/data/satelital.json` is produced offline by the Python pipeline (shared helpers in `scripts/s2_common.py`, consumed by `ndvi_snapshot.py` and a new `snow_snapshot.py`). The web app reads it through a zod loader (`src/lib/satelital.ts`) with pure trend/snow helpers, and renders small editorial additions (a `TrendBadge`, an NDMI signal, a snow indicator) that degrade gracefully if the file or any field is absent.

**Tech Stack:** Python (rasterio, pystac-client, planetary-computer, numpy, Pillow) — `.venv` already cached; TypeScript, Zod, Vitest; Next 16 + Tailwind 4 (editorial components from Increment 1).

**Build order:** lib (contract) → UI (graceful) → pipeline (heavy, real data) → verify. The UI never hard-depends on the heavy pipeline.

---

## Data contract — `public/data/satelital.json`
Every top-level key is OPTIONAL (the pipeline may produce a subset; the UI shows what exists):
```json
{
  "ndmiAimogasta": 0.18,
  "ndviTrend": { "actual": 0.50, "anterior": 0.46, "fechaAnterior": "2026-04-20" },
  "nieve": { "cobertura": 12, "fecha": "2026-06-10", "region": "Sierra de Famatina" }
}
```

---

## Task 1: `src/lib/satelital.ts` — schema + pure helpers (TDD)

**Files:** Create `src/lib/satelital.ts`, `src/lib/satelital.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/satelital.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ndviTrend, snowCoverStatus, SatelitalSchema } from "./satelital";

describe("ndviTrend", () => {
  it("mejoró when current is clearly higher", () => {
    const t = ndviTrend(0.5, 0.46);
    expect(t.label).toBe("mejoró");
    expect(t.pct).toBe(9);
  });
  it("empeoró when current is clearly lower", () => {
    expect(ndviTrend(0.46, 0.5).label).toBe("empeoró");
  });
  it("estable within ±3%", () => {
    expect(ndviTrend(0.5, 0.49).label).toBe("estable");
  });
});

describe("snowCoverStatus", () => {
  it("alerta when snow cover is very low", () => {
    expect(snowCoverStatus(2).nivel).toBe("alerta");
  });
  it("atencion mid", () => {
    expect(snowCoverStatus(12).nivel).toBe("atencion");
  });
  it("ok when ample", () => {
    expect(snowCoverStatus(40).nivel).toBe("ok");
    expect(snowCoverStatus(40).valor).toBe("40%");
  });
});

describe("SatelitalSchema", () => {
  it("accepts a partial payload (all keys optional)", () => {
    expect(() => SatelitalSchema.parse({ nieve: { cobertura: 10, fecha: "2026-06-10", region: "x" } })).not.toThrow();
    expect(() => SatelitalSchema.parse({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- satelital`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/satelital.ts`:
```ts
import { z } from "zod";

export const SatelitalSchema = z.object({
  ndmiAimogasta: z.number().optional(),
  ndviTrend: z
    .object({ actual: z.number(), anterior: z.number(), fechaAnterior: z.string() })
    .optional(),
  nieve: z
    .object({ cobertura: z.number(), fecha: z.string(), region: z.string() })
    .optional(),
});
export type Satelital = z.infer<typeof SatelitalSchema>;

export function ndviTrend(
  actual: number,
  anterior: number,
): { delta: number; pct: number; label: "mejoró" | "empeoró" | "estable" } {
  const delta = actual - anterior;
  const pct = anterior !== 0 ? Math.round((delta / anterior) * 100) : 0;
  const label = pct > 3 ? "mejoró" : pct < -3 ? "empeoró" : "estable";
  return { delta: Math.round(delta * 100) / 100, pct, label };
}

export function snowCoverStatus(pct: number): { valor: string; nivel: "ok" | "atencion" | "alerta" } {
  const nivel = pct < 5 ? "alerta" : pct < 20 ? "atencion" : "ok";
  return { valor: `${Math.round(pct)}%`, nivel };
}

// Client loader; returns null if the file is absent/invalid so the UI degrades.
export async function fetchSatelital(): Promise<Satelital | null> {
  try {
    const res = await fetch("/data/satelital.json");
    if (!res.ok) return null;
    return SatelitalSchema.parse(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- satelital`
Expected: PASS (7 tests). Note `ndviTrend(0.5,0.46)`: delta .04, pct round(.04/.46*100)=round(8.7)=9 → "mejoró".

- [ ] **Step 5: Commit**

```bash
git add src/lib/satelital.ts src/lib/satelital.test.ts
git commit -m "feat: satelital.ts — zod schema + ndviTrend/snowCoverStatus helpers (TDD)"
```

---

## Task 2: UI — TrendBadge + wire NDMI, trend, snow (graceful)

**Files:** Create `src/components/trend-badge.tsx`; Modify `src/components/producer-view.tsx`, `src/app/panel/page.tsx`

Verified via preview (controller). All additions must no-op if `satelital` data is absent.

- [ ] **Step 1: TrendBadge**

Create `src/components/trend-badge.tsx`:
```tsx
"use client";

import { ndviTrend } from "@/lib/satelital";

export default function TrendBadge({ actual, anterior }: { actual: number; anterior: number }) {
  const t = ndviTrend(actual, anterior);
  const tone =
    t.label === "mejoró"
      ? "bg-emerald-50 text-emerald-800"
      : t.label === "empeoró"
        ? "bg-red-50 text-red-800"
        : "bg-stone-100 text-stone-700";
  const arrow = t.label === "mejoró" ? "↑" : t.label === "empeoró" ? "↓" : "→";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] ${tone}`}>
      {arrow} Vegetación {t.label} {Math.abs(t.pct)}% vs. hace ~1 mes
    </span>
  );
}
```

- [ ] **Step 2: Load satelital in ProducerView; add NDMI signal + TrendBadge**

In `src/components/producer-view.tsx`: add state `const [sat, setSat] = useState<Satelital | null>(null)` and an effect `useEffect(() => { fetchSatelital().then(setSat); }, [])` (import `fetchSatelital`, `type Satelital` from `@/lib/satelital`). Then:
- If `sat?.ndmiAimogasta != null`, append an NDMI entry to the signals passed into `<SignalGrid>`: `{ etiqueta: "Humedad vegetación (NDMI)", valor: sat.ndmiAimogasta.toFixed(2), nivel: sat.ndmiAimogasta < 0.1 ? "alerta" : sat.ndmiAimogasta < 0.2 ? "atencion" : "ok" }`.
- If `sat?.ndviTrend`, render `<TrendBadge actual={sat.ndviTrend.actual} anterior={sat.ndviTrend.anterior} />` near the finca title / hero.

- [ ] **Step 3: Gestión — TrendBadge on Arauco + snow indicator**

In `src/app/panel/page.tsx`: load satelital (same `fetchSatelital` effect + `sat` state). Then:
- When the selected department is `Arauco` and `sat?.ndviTrend` exists, render `<TrendBadge .../>` inside the department detail area.
- In the Gestión hero/sidebar, if `sat?.nieve` exists, render a snow indicator card: label "Nieve en la cordillera (Famatina)", value `snowCoverStatus(sat.nieve.cobertura).valor`, with a muted footer `· captura ${sat.nieve.fecha}` (import `snowCoverStatus`). Use the editorial `.ed-card`/`ed-faint` classes; color the value dot by `snowCoverStatus(...).nivel`.

- [ ] **Step 4: Build sanity**

Run: `npm run build` → clean. `npm run lint` → clean (no set-state-in-effect: the new effects only call setState inside the async `.then`, which is allowed; do NOT add a synchronous `setSat(null)` in the effect body).

- [ ] **Step 5: Commit**

```bash
git add src/components/trend-badge.tsx src/components/producer-view.tsx src/app/panel/page.tsx
git commit -m "feat: TrendBadge + NDMI signal + snow indicator (graceful if satelital absent)"
```

---

## Task 3: Python pipeline — s2_common + NDMI/trend + snow (run to produce real data)

**Files:** Create `scripts/s2_common.py`, `scripts/snow_snapshot.py`; Modify `scripts/ndvi_snapshot.py`; generates `public/data/satelital.json`

Heavy/offline. `.venv` is already present. Run from the repo root with the venv active (`. .venv/Scripts/activate`).

- [ ] **Step 1: Extract shared helpers into `scripts/s2_common.py`**

Create `scripts/s2_common.py` by lifting the proven helpers from `ndvi_snapshot.py` (keep behavior identical):
```python
"""Shared Sentinel-2 helpers (Planetary Computer STAC + local reproject)."""
import json
import os
import numpy as np
import planetary_computer
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.warp import reproject
from pystac_client import Client

BOA_ADD_OFFSET = -1000.0
QUANTIFICATION = 10000.0
DST_RES = 0.0001

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SATELITAL_PATH = os.path.join(ROOT, "public", "data", "satelital.json")


def open_catalog():
    return Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )


def find_scenes(bbox, mgrs_tile=None, max_cloud=10, limit=20):
    """Return Sentinel-2 L2A items over bbox, newest first."""
    query = {"eo:cloud_cover": {"lt": max_cloud}}
    if mgrs_tile:
        query["s2:mgrs_tile"] = {"eq": mgrs_tile}
    search = open_catalog().search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        query=query,
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=limit,
    )
    return list(search.items())


def download_asset(href, dst_path):
    with requests.get(href, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dst_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    return dst_path


def read_band_to_4326(local_path, bbox, res=DST_RES):
    w, s, e, n = bbox
    width = int(round((e - w) / res))
    height = int(round((n - s) / res))
    dst_transform = rasterio.transform.from_bounds(w, s, e, n, width, height)
    with rasterio.open(local_path) as src:
        dst = np.full((height, width), np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            src_transform=src.transform, src_crs=src.crs,
            dst_transform=dst_transform, dst_crs="EPSG:4326",
            resampling=Resampling.bilinear, src_nodata=0, dst_nodata=np.nan,
        )
    return dst


def to_reflectance(arr):
    return (arr + BOA_ADD_OFFSET) / QUANTIFICATION


def merge_satelital(partial: dict):
    """Read-modify-write public/data/satelital.json, updating only given keys."""
    data = {}
    if os.path.exists(SATELITAL_PATH):
        with open(SATELITAL_PATH, encoding="utf-8") as f:
            data = json.load(f)
    data.update(partial)
    os.makedirs(os.path.dirname(SATELITAL_PATH), exist_ok=True)
    with open(SATELITAL_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"merged into {SATELITAL_PATH}: {list(partial.keys())}")
```

Then refactor `ndvi_snapshot.py` to import these (`from s2_common import ...` — note: run scripts from the `scripts/` dir or add `sys.path`; simplest is `import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))` then `import s2_common as s2`). Replace its local `find_scene`/`download_asset`/`read_band_to_4326`/constants with the shared ones. Re-run it (Step 3) to confirm the NDVI PNG/bounds output is byte-for-byte equivalent in behavior (same scene, same classes).

- [ ] **Step 2: Add NDMI + NDVI trend to `ndvi_snapshot.py`**

After computing the current NDVI, add:
```python
import s2_common as s2

# --- NDMI on the SAME current scene: (B08 - B11) / (B08 + B11) ---
swir_href = item.assets["B11"].href
swir_local = s2.download_asset(swir_href, os.path.join(tmpdir, "B11.tif"))
swir = s2.read_band_to_4326(swir_local, BBOX)
nir_r2 = s2.to_reflectance(nir)
swir_r = s2.to_reflectance(swir)
with np.errstate(divide="ignore", invalid="ignore"):
    ndmi = (nir_r2 - swir_r) / (nir_r2 + swir_r)
ndmi_mean = float(np.nanmean(ndmi[np.isfinite(ndmi)]))
print(f"NDMI mean: {ndmi_mean:.3f}")

# --- NDVI trend: an older scene (>= ~30 days before the current one) ---
from datetime import timedelta
cur_dt = item.datetime
older = next((it for it in s2.find_scenes(BBOX, MGRS_TILE, max_cloud=15, limit=30)
              if (cur_dt - it.datetime) >= timedelta(days=28)), None)
ndvi_trend = None
if older is not None:
    o_red = s2.read_band_to_4326(s2.download_asset(older.assets["B04"].href, os.path.join(tmpdir, "oB04.tif")), BBOX)
    o_nir = s2.read_band_to_4326(s2.download_asset(older.assets["B08"].href, os.path.join(tmpdir, "oB08.tif")), BBOX)
    o_red_r, o_nir_r = s2.to_reflectance(o_red), s2.to_reflectance(o_nir)
    with np.errstate(divide="ignore", invalid="ignore"):
        o_ndvi = (o_nir_r - o_red_r) / (o_nir_r + o_red_r)
    ndvi_trend = {
        "actual": round(vmean, 3),
        "anterior": round(float(np.nanmean(o_ndvi[np.isfinite(o_ndvi)])), 3),
        "fechaAnterior": older.datetime.strftime("%Y-%m-%d"),
    }
    print(f"NDVI trend: {ndvi_trend}")

s2.merge_satelital({"ndmiAimogasta": round(ndmi_mean, 3),
                    **({"ndviTrend": ndvi_trend} if ndvi_trend else {})})
```
(`vmean` is the existing current-scene NDVI mean; reuse it. Ensure B11/older downloads happen inside the same `tmpdir` lifetime before cleanup — move the cleanup of temp files to after this block, or extend the cleanup list.)

- [ ] **Step 3: Create `scripts/snow_snapshot.py` (Famatina NDSI)**

```python
"""Snow cover over the Sierra de Famatina via Sentinel-2 NDSI = (B03-B11)/(B03+B11)."""
import os, sys, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_common as s2

# Sierra de Famatina high range (feeds the Chilecito/Famatina valleys).
FAMATINA_BBOX = [-67.85, -29.10, -67.65, -28.85]
NDSI_SNOW = 0.4

def main():
    scenes = s2.find_scenes(FAMATINA_BBOX, mgrs_tile=None, max_cloud=20, limit=20)
    if not scenes:
        raise SystemExit("No low-cloud Sentinel-2 scene over the Famatina range.")
    item = scenes[0]
    print(f"Snow scene: {item.id}  {item.datetime}  cloud={item.properties.get('eo:cloud_cover')}")
    tmp = tempfile.mkdtemp(prefix="snow_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None)
    try:
        green = s2.read_band_to_4326(s2.download_asset(item.assets["B03"].href, os.path.join(tmp, "B03.tif")), FAMATINA_BBOX)
        swir = s2.read_band_to_4326(s2.download_asset(item.assets["B11"].href, os.path.join(tmp, "B11.tif")), FAMATINA_BBOX)
    finally:
        for fn in ("B03.tif", "B11.tif"):
            p = os.path.join(tmp, fn)
            if os.path.exists(p):
                try: os.remove(p)
                except OSError: pass
        try: os.rmdir(tmp)
        except OSError: pass
    g, sw = s2.to_reflectance(green), s2.to_reflectance(swir)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndsi = (g - sw) / (g + sw)
    valid = np.isfinite(ndsi)
    snow = valid & (ndsi > NDSI_SNOW)
    pct = round(100.0 * int(snow.sum()) / max(1, int(valid.sum())), 1)
    print(f"Snow cover: {pct}% of valid pixels")
    s2.merge_satelital({"nieve": {"cobertura": pct, "fecha": item.datetime.strftime("%Y-%m-%d"), "region": "Sierra de Famatina"}})

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the pipeline (produces real data)**

```bash
. .venv/Scripts/activate
python scripts/ndvi_snapshot.py
python scripts/snow_snapshot.py
```
Expected: prints real NDMI mean, an NDVI trend pair (current vs ~1-month-older), and a Famatina snow %. `public/data/satelital.json` now has the three keys with real values + dates. Sanity-check: NDMI in a plausible range (~0.05–0.35 for irrigated groves), trend dates ~4-6 weeks apart, snow % plausible for the season (June = austral winter → likely some snow on the high range). If the Famatina range has no low-cloud scene, widen `max_cloud` to 30 and note the older date.

- [ ] **Step 5: Commit**

```bash
git add scripts/s2_common.py scripts/snow_snapshot.py scripts/ndvi_snapshot.py public/data/satelital.json public/raster/
git commit -m "feat: real Sentinel-2 NDMI + NDVI trend (Aimogasta) + snow cover (Famatina) -> satelital.json"
```

> If the heavy downloads cannot complete in this environment, STOP and report BLOCKED with what failed — do NOT fabricate `satelital.json` values. The UI already degrades gracefully without the file.

---

## Task 4: Final verification

- [ ] **Step 1: Tests + lint + build**

Run: `npm test` (all pass incl. satelital), `npm run lint` (clean), `npm run build` (clean).

- [ ] **Step 2: End-to-end (controller)**

`npm run dev` → `/panel`: Productor shows the NDMI signal + the TrendBadge ("Vegetación mejoró/empeoró X% vs. hace ~1 mes"); Gestión shows the "Nieve en la cordillera (Famatina): X%" indicator and a TrendBadge when Arauco is selected. Confirm graceful behavior if `satelital.json` is removed (no crash). Verify via DOM/screenshot.

---

## Self-Review

**1. Spec coverage:**
- NDMI (Aimogasta) → Task 3 Step 2 + Task 2 Step 2. ✓
- NDVI trend (Aimogasta, real, 2nd scene) → Task 3 Step 2 (older-scene pick ≥28 days) + Task 1 `ndviTrend` + Task 2 (TrendBadge). ✓
- Snow NDSI over Famatina → Task 3 Step 3 + Task 1 `snowCoverStatus` + Task 2 Step 3. ✓
- Consolidated `satelital.json`, graceful UI, no new secret/backend → Task 1 (loader returns null), Task 2 (all additions guarded), Task 3 (`merge_satelital`). ✓
- Honesty (zone snapshots, dated, no baseline) → values carry `fecha`/`fechaAnterior`; snow labeled "captura". ✓
- Testing (TDD pure fns; pipeline offline; UI preview) → Tasks 1, 3, 4. ✓

**2. Placeholder scan:** The `satelital.json` example block is the contract, not committed data — Task 3 produces the real file (with an explicit BLOCKED-not-fabricate instruction). No "TBD"/"handle edge cases". The pipeline refactor explicitly requires re-running to confirm NDVI parity.

**3. Type consistency:** `Satelital`/`SatelitalSchema` (Task 1) consumed by Task 2 (`fetchSatelital`, `sat.ndmiAimogasta`, `sat.ndviTrend.{actual,anterior}`, `sat.nieve.{cobertura,fecha}`). `ndviTrend(actual, anterior)` signature matches TrendBadge usage. `snowCoverStatus(pct)` returns `{valor,nivel}` used in Task 2 Step 3. The JSON keys written by `merge_satelital` (Task 3: `ndmiAimogasta`, `ndviTrend`, `nieve`) match `SatelitalSchema`. Consistent.

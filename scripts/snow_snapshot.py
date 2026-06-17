"""Snow cover over the Sierra de Famatina via Sentinel-2 NDSI = (B03-B11)/(B03+B11).

Picks the most recent low-cloud Sentinel-2 L2A scene over the Famatina high
range, computes NDSI on offset-corrected reflectance, thresholds NDSI > 0.4 to
flag snow, and writes the snow percentage (of valid pixels) to satelital.json.

Run:  python scripts/snow_snapshot.py
"""
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_common as s2

# Sierra de Famatina high range (feeds the Chilecito/Famatina valleys).
FAMATINA_BBOX = [-67.85, -29.10, -67.65, -28.85]
NDSI_SNOW = 0.4


def main():
    max_cloud = 20
    scenes = s2.find_scenes(FAMATINA_BBOX, mgrs_tile=None, max_cloud=max_cloud, limit=20)
    if not scenes:
        # Widen the cloud threshold once (per plan) before giving up.
        max_cloud = 30
        print("No scene < 20% cloud over Famatina; widening to 30%.")
        scenes = s2.find_scenes(FAMATINA_BBOX, mgrs_tile=None, max_cloud=max_cloud, limit=20)
    if not scenes:
        raise SystemExit("No low-cloud Sentinel-2 scene over the Famatina range.")
    item = scenes[0]
    print(f"Snow scene: {item.id}  {item.datetime}  "
          f"cloud={item.properties.get('eo:cloud_cover')}  (max_cloud={max_cloud})")
    tmp = tempfile.mkdtemp(prefix="snow_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None)
    try:
        print("Downloading B03 (green) ...")
        green = s2.read_band_to_4326(
            s2.download_asset(item.assets["B03"].href, os.path.join(tmp, "B03.tif")),
            FAMATINA_BBOX,
        )
        print("Downloading B11 (swir) ...")
        swir = s2.read_band_to_4326(
            s2.download_asset(item.assets["B11"].href, os.path.join(tmp, "B11.tif")),
            FAMATINA_BBOX,
        )
    finally:
        for fn in ("B03.tif", "B11.tif"):
            p = os.path.join(tmp, fn)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass
    g, sw = s2.to_reflectance(green), s2.to_reflectance(swir)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndsi = (g - sw) / (g + sw)
    valid = np.isfinite(ndsi)
    if int(valid.sum()) == 0:
        raise SystemExit("No valid NDSI pixels - scene does not cover the Famatina bbox.")
    snow = valid & (ndsi > NDSI_SNOW)
    pct = round(100.0 * int(snow.sum()) / max(1, int(valid.sum())), 1)
    print(f"Snow cover: {pct}% of valid pixels")
    s2.merge_satelital({
        "nieve": {
            "cobertura": pct,
            "fecha": item.datetime.strftime("%Y-%m-%d"),
            "region": "Sierra de Famatina",
        }
    })


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""One-off: tonemap HDR EXR starfield → LDR PNG then shell out to cwebp (space background)."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import Imath
import numpy as np
import OpenEXR
from PIL import Image


def exr_rgb_to_uint8(path: Path) -> Image.Image:
    f = OpenEXR.InputFile(str(path))
    hdr = f.header()
    dw = hdr["dataWindow"]
    w = dw.max.x - dw.min.x + 1
    h = dw.max.y - dw.min.y + 1
    pt = Imath.PixelType(Imath.PixelType.FLOAT)
    r = np.frombuffer(f.channel("R", pt), dtype=np.float32).reshape(h, w)
    g = np.frombuffer(f.channel("G", pt), dtype=np.float32).reshape(h, w)
    b = np.frombuffer(f.channel("B", pt), dtype=np.float32).reshape(h, w)
    rgb = np.stack([r, g, b], axis=-1)
    rgb = np.nan_to_num(rgb, nan=0.0, posinf=0.0, neginf=0.0)
    # Starfield HDR → display-referred (gentle rolloff, preserve faint stars)
    lo = np.percentile(rgb, 0.5)
    hi = np.percentile(rgb, 99.95)
    rgb = (rgb - lo) / (hi - lo + 1e-8)
    rgb = np.clip(rgb, 0.0, 1.0)
    rgb = np.power(rgb, 1.0 / 2.2)
    u8 = (rgb * 255.0).astype(np.uint8)
    return Image.fromarray(u8, mode="RGB")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    exr_path = root / "public" / "starmap_random_2020_8k.exr"
    out_webp = root / "public" / "space-background.webp"
    if not exr_path.is_file():
        print("Missing:", exr_path, file=sys.stderr)
        return 1

    print("Reading & tonemapping EXR…", flush=True)
    img = exr_rgb_to_uint8(exr_path)
    print(f"Tonemapped size {img.width}x{img.height}", flush=True)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        png_path = Path(tmp.name)
    try:
        img.save(png_path, compress_level=3)
        print("Encoding WebP…", flush=True)
        r = subprocess.run(
            [
                "cwebp",
                "-q",
                "86",
                "-mt",
                str(png_path),
                "-o",
                str(out_webp),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(r.stderr or r.stdout, file=sys.stderr)
            return r.returncode
    finally:
        png_path.unlink(missing_ok=True)

    print("Wrote", out_webp, out_webp.stat().st_size, "bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

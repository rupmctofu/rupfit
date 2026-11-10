#!/usr/bin/env python
"""Cut an approved illustration out of its backdrop and ship it as a WebP.

The owner approves the picture; this tool only removes what the app will not show: the flat
backdrop, the empty margin and the weight. No regeneration, no tracing, so the variant
cannot drift — what was approved is what ships.

The backdrop is whatever colour the four corners agree on, and the alpha ramp is soft so the
outline keeps its anti-aliasing instead of turning into a staircase.

    C:/Users/rober/ComfyUI/venv/Scripts/python.exe tools/art/cutout.py \
        "design/art/jpg/press banca.jpg" public/art/bench-press.webp --size 512
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

MARGIN = 0.04  # share of the final canvas left empty around the figure


def cutout(image: Image.Image, tolerance: int, softness: float) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    height, width, _ = rgb.shape
    corners = np.concatenate(
        [
            rgb[:16, :16].reshape(-1, 3),
            rgb[:16, -16:].reshape(-1, 3),
            rgb[-16:, :16].reshape(-1, 3),
            rgb[-16:, -16:].reshape(-1, 3),
        ]
    )
    backdrop = np.median(corners, axis=0)
    distance = np.sqrt(((rgb - backdrop) ** 2).sum(axis=2))

    # 0 where the pixel matches the backdrop, 255 once it is clearly the figure.
    alpha = np.clip((distance - tolerance) / softness, 0.0, 1.0) * 255.0
    alpha = alpha.astype(np.uint8)

    rgba = np.dstack([np.asarray(image.convert("RGB"), dtype=np.uint8), alpha])
    cut = Image.fromarray(rgba, mode="RGBA")

    box = cut.getbbox()
    if box is None:
        raise SystemExit("everything matched the backdrop: raise --tolerance")
    return cut.crop(box)


def square(image: Image.Image, size: int) -> Image.Image:
    side = int(max(image.size) * (1 + 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2), image)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--tolerance", type=int, default=26, help="colour distance still counted as backdrop")
    parser.add_argument("--softness", type=float, default=48.0, help="how wide the alpha ramp is")
    parser.add_argument("--quality", type=int, default=82)
    options = parser.parse_args()

    image = Image.open(options.source)
    figure = cutout(image, options.tolerance, options.softness)
    final = square(figure, options.size)
    os.makedirs(os.path.dirname(options.target) or ".", exist_ok=True)
    final.save(options.target, "WEBP", quality=options.quality, method=6)
    print(
        "%-46s %3d KB  %dx%d"
        % (options.target, os.path.getsize(options.target) / 1024, options.size, options.size)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

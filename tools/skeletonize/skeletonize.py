#!/usr/bin/env python
"""Skeletonise a generated exercise image into limbs we could draw.

The traced SVG path failed not because tracing is bad but because it traces *outlines*:
a shaded render becomes tens of thousands of blobs. Our pictograms are not outlines, they
are axes: one stroke per femur, one per torso. So this tool reduces a picture to its
medial skeleton, prunes the spurs, fits polylines and reports how many points the result
needs — the same budget the app draws with (<= 40 nodes, see tests/vector-budget.ts).

Runs on the ComfyUI virtualenv (numpy, Pillow, scikit-image, scipy are already there):

    C:/Users/rober/ComfyUI/venv/Scripts/python.exe tools/skeletonize/skeletonize.py \
        "design/art/press banca.jpg" --svg design/art/out/skeleton-press.svg

It writes nothing unless asked. The JSON on stdout is the contract: the caller decides.

Honest limits, documented because they are the reason this is an authoring aid and not an
asset pipeline: a 2D silhouette where a barbell crosses the torso creates a fake junction;
the pose is the model's, not the variant's canonical one; and a limb that overlaps another
in the picture disappears from the skeleton.
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.ndimage import binary_fill_holes
from skimage.morphology import skeletonize

GRID = 120.0
NEIGHBOURS_8 = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def silhouette(image: Image.Image, tolerance: int) -> np.ndarray:
    """Figure against background: the background is whatever colour the corners agree on."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    corners = np.concatenate(
        [rgb[:12, :12].reshape(-1, 3), rgb[:12, -12:].reshape(-1, 3),
         rgb[-12:, :12].reshape(-1, 3), rgb[-12:, -12:].reshape(-1, 3)]
    )
    background = np.median(corners, axis=0)
    distance = np.sqrt(((rgb - background) ** 2).sum(axis=2))
    mask = distance > tolerance
    mask = binary_fill_holes(mask)

    # Only the athlete: keep the largest connected blob and drop every other speck.
    labels, count = ndimage.label(mask)
    if count == 0:
        raise SystemExit("no figure found: raise --tolerance")
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    biggest = int(np.argmax(sizes)) + 1
    return labels == biggest


def neighbours(point: tuple[int, int], pixels: set[tuple[int, int]]) -> list[tuple[int, int]]:
    y, x = point
    return [(y + dy, x + dx) for dy, dx in NEIGHBOURS_8 if (y + dy, x + dx) in pixels]


def rdp(points: list[tuple[int, int]], epsilon: float) -> list[tuple[int, int]]:
    """Douglas-Peucker: keep the fewest points that stay within `epsilon` of the path."""
    if len(points) < 3:
        return points
    start, end = np.array(points[0], dtype=float), np.array(points[-1], dtype=float)
    span = end - start
    norm = float(np.hypot(*span))
    worst, index = -1.0, 0
    for position in range(1, len(points) - 1):
        candidate = np.array(points[position], dtype=float)
        if norm == 0.0:
            distance = float(np.hypot(*(candidate - start)))
        else:
            distance = abs(float(span[0] * (start[1] - candidate[1]) - span[1] * (start[0] - candidate[0]))) / norm
        if distance > worst:
            worst, index = distance, position
    if worst <= epsilon:
        return [points[0], points[-1]]
    left = rdp(points[: index + 1], epsilon)
    right = rdp(points[index:], epsilon)
    return left[:-1] + right


def branches_of(skeleton: np.ndarray) -> list[list[tuple[int, int]]]:
    """Walk the 1px skeleton into polylines, splitting at junctions and endpoints."""
    pixels = {tuple(int(value) for value in point) for point in np.argwhere(skeleton)}
    if not pixels:
        return []
    degree = {point: len(neighbours(point, pixels)) for point in pixels}
    anchors = [point for point in pixels if degree[point] != 2]
    walked: set[frozenset[tuple[int, int]]] = set()
    paths: list[list[tuple[int, int]]] = []

    def walk(start: tuple[int, int], step: tuple[int, int]) -> list[tuple[int, int]]:
        path = [start, step]
        walked.add(frozenset((start, step)))
        previous, current = start, step
        while degree.get(current, 0) == 2:
            ahead = [n for n in neighbours(current, pixels) if n != previous and frozenset((current, n)) not in walked]
            if not ahead:
                break
            walked.add(frozenset((current, ahead[0])))
            previous, current = current, ahead[0]
            path.append(current)
        return path

    for anchor in anchors:
        for step in neighbours(anchor, pixels):
            if frozenset((anchor, step)) in walked:
                continue
            paths.append(walk(anchor, step))
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--tolerance", type=int, default=48, help="colour distance that counts as figure")
    parser.add_argument("--epsilon", type=float, default=2.0, help="Douglas-Peucker tolerance in pixels")
    parser.add_argument("--min-branch", type=float, default=0.05, help="drop branches shorter than this fraction of the diagonal")
    parser.add_argument("--svg", help="write an SVG of the result here")
    parser.add_argument("--png", help="write a PNG preview of the result here")
    parser.add_argument("--png-scale", type=float, default=4.0, help="pixels per grid unit in the PNG")
    options = parser.parse_args()

    image = Image.open(options.image)
    mask = silhouette(image, options.tolerance)
    skeleton = skeletonize(mask)

    height, width = skeleton.shape
    diagonal = math.hypot(width, height)
    paths = branches_of(skeleton)

    kept = []
    for path in paths:
        simplified = rdp(path, options.epsilon)
        length = sum(math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) for i in range(len(path) - 1))
        if length < options.min_branch * diagonal:
            continue
        kept.append(simplified)

    scale = GRID / max(width, height)
    limbs = [
        [[round(point[1] * scale, 1), round(point[0] * scale, 1)] for point in path]
        for path in kept
    ]
    nodes = sum(len(limb) for limb in limbs) + 1  # +1: the head, drawn as a circle

    thickness = ndimage.distance_transform_edt(mask)
    head_y, head_x = np.unravel_index(int(np.argmax(thickness)), thickness.shape)

    report = {
        "image": options.image,
        "size": [width, height],
        "figurePixels": int(mask.sum()),
        "skeletonPixels": int(skeleton.sum()),
        "branchesFound": len(paths),
        "limbs": len(limbs),
        "nodes": nodes,
        "budget": 40,
        "fits": nodes <= 40,
        "head": [round(head_x * scale, 1), round(head_y * scale, 1)],
        "headRadius": round(float(thickness[head_y, head_x]) * scale, 1),
        "data": {"head": [round(head_x * scale, 1), round(head_y * scale, 1)], "body": limbs},
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))

    if options.svg:
        polylines = "\n".join(
            '  <polyline points="{}" fill="none" stroke="#bbaaff" stroke-width="3" stroke-linecap="round"/>'.format(
                " ".join(f"{x},{y}" for x, y in limb)
            )
            for limb in limbs
        )
        with open(options.svg, "w", encoding="utf-8") as handle:
            handle.write(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {int(GRID)} {int(GRID)}" width="360" height="360">\n'
                f'  <rect width="120" height="120" fill="#1a1826"/>\n'
                f'  <circle cx="{report["head"][0]}" cy="{report["head"][1]}" r="{max(report["headRadius"], 4)}" fill="#bbaaff"/>\n'
                f"{polylines}\n</svg>\n"
            )

    if options.png:
        # A preview the terminal can show: the same geometry, drawn with Pillow.
        from PIL import ImageDraw

        canvas = Image.new("RGB", (int(GRID * options.png_scale), int(GRID * options.png_scale)), (26, 24, 38))
        pen = ImageDraw.Draw(canvas)
        width = max(2, int(3 * options.png_scale))
        for limb in limbs:
            points = [(x * options.png_scale, y * options.png_scale) for x, y in limb]
            pen.line(points, fill=(187, 170, 255), width=width, joint="curve")
        radius = max(report["headRadius"], 4) * options.png_scale
        hx, hy = report["head"][0] * options.png_scale, report["head"][1] * options.png_scale
        pen.ellipse([hx - radius, hy - radius, hx + radius, hy + radius], fill=(187, 170, 255))
        canvas.save(options.png)
    return 0


if __name__ == "__main__":
    sys.exit(main())

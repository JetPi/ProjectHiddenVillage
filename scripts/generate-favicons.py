#!/usr/bin/env python3
"""Regenerate the client favicon set from client/src/assets/TabIcon.png.

The master artwork is a flattened "sticker" render: a maroon disc with white line
art, plus a baked black drop shadow that fades out past the disc edge. Dropped
straight into a browser tab that shadow shows up as a dark halo, so this script
masks everything outside the disc, traces the remaining line art to vector paths
(potrace), and re-renders the whole icon set from that vector, which stays sharp
at 16px instead of turning to mud like a plain downscale does.

Outputs (all under client/public, which Vite serves at the site root):

  favicon.svg          faithful vector, inset rings included - modern browsers
  favicon-16.png       legibility-tuned: thin inset ring dropped, edge kept
  favicon-32.png       faithful vector render
  favicon-48.png       faithful vector render
  favicon.ico          16 (tuned) + 32/48 (faithful) for legacy requests
  apple-touch-icon.png opaque maroon 180px square, outer stroke trimmed so the
                       circle edge does not seam against the background

Requires: python3 with Pillow and numpy, plus `potrace` and `rsvg-convert`
(poppler) on PATH. Run from the repository root:

    python3 scripts/generate-favicons.py
"""

from __future__ import annotations

import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "client" / "src" / "assets" / "TabIcon.png"
OUT_DIR = ROOT / "client" / "public"

# Alpha level that still counts as the solid disc edge. Measured against the
# source: everything below it is the soft shadow, everything above is artwork.
DISC_ALPHA = 250
# Luminance above which a pixel belongs to the white line art.
WHITE_LUMINANCE = 130
# Thin inset ring, as a fraction of the disc radius (measured: r 384..422 of 474.5).
# It survives at 32px and up but only adds haze at 16px, so the 16px render drops it.
INNER_RING = (0.808, 0.890)
# Gaussian blur applied to the luminance before thresholding. The source line art
# carries compression ringing, so a raw threshold gives potrace a ragged contour
# and the resulting SVG balloons past 80KB. This radius (a fraction of a percent
# of the disc) smooths the contour without visibly moving it.
TRACE_BLUR = 2
# Radius fraction kept for the apple-touch render, chosen to fall just inside the
# outer white stroke so the trimmed circle has no visible seam.
TOUCH_KEEP = 900 / 949


def measure_disc(image: Image.Image) -> tuple[int, int, int, int]:
    """Tight bounding box of the solid disc (shadow excluded by the alpha threshold)."""
    level = image.getchannel("A").point(lambda a: 255 if a >= DISC_ALPHA else 0)
    return level.getbbox()


def write_threshold_bitmap(white: np.ndarray, path: Path) -> None:
    """potrace reads pnm/bmp only; black is the foreground it traces."""
    bitmap = np.where(white, 0, 255).astype(np.uint8)
    Image.fromarray(bitmap, "L").convert("1").save(path)


def trace(bitmap: Path, svg: Path, turdsize: int) -> None:
    subprocess.run(
        [
            "potrace",
            "-s",
            "-O", "1.5",                  # curve optimisation tolerance
            "--turdsize", str(turdsize),  # drop specks introduced by the source's compression
            "--alphamax", "1.0",          # keep corners crisp
            "-o", str(svg),
            str(bitmap),
        ],
        check=True,
    )


def compose_svg(traced: Path, span: int, fill: str, background: str) -> str:
    """Wrap the traced line art in a clipped disc of the background colour."""
    text = traced.read_text()
    body = text.split("<metadata>", 1)[1]
    paths = re.findall(r"<path[^>]*/>", body)
    transform = re.search(r'<g transform="([^"]+)"', body).group(1)
    indent = "\n      ".join(paths)
    centre = span / 2.0
    disc = f'<circle cx="{centre}" cy="{centre}" r="{centre}"/>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {span} {span}" '
        f'width="{span}" height="{span}" role="img">\n'
        "  <title>Hidden Village</title>\n"
        "  <defs>\n"
        f'    <clipPath id="disc">{disc}</clipPath>\n'
        "  </defs>\n"
        '  <g clip-path="url(#disc)">\n'
        f'    <circle cx="{centre}" cy="{centre}" r="{centre}" fill="{background}"/>\n'
        f'    <g transform="{transform}" fill="{fill}" stroke="none">\n'
        f"      {indent}\n"
        "    </g>\n"
        "  </g>\n"
        "</svg>\n"
    )


def write_ico(frames: list[tuple[int, Path]], out: Path) -> None:
    """Pack the PNG frames into one .ico.

    Pillow's ICO writer only downscales a single bitmap, so it silently collapses
    the hand-tuned 16px frame and the vector-rendered larger ones into one entry.
    The container is trivial to assemble, and PNG payloads are legal in .ico for
    every browser that still falls back to /favicon.ico.
    """
    header = struct.pack("<HHH", 0, 1, len(frames))
    payloads = [path.read_bytes() for _, path in frames]
    offset = len(header) + 16 * len(frames)
    entries = bytearray()
    for (size, _), data in zip(frames, payloads):
        dimension = 0 if size >= 256 else size  # 0 means 256 in an ICO directory
        entries += struct.pack(
            "<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(data), offset
        )
        offset += len(data)
    out.write_bytes(header + bytes(entries) + b"".join(payloads))


def render(svg: Path, size: int, out: Path) -> None:
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), str(svg), "-o", str(out)],
        check=True,
    )


def hex_color(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def main() -> int:
    for tool in ("potrace", "rsvg-convert"):
        if subprocess.run(["which", tool], capture_output=True).returncode != 0:
            print(f"missing required tool: {tool}", file=sys.stderr)
            return 1

    image = Image.open(SOURCE).convert("RGBA")
    left, top, right, bottom = measure_disc(image)
    # The measured box is off by a pixel or two; square it up so the disc sits in a
    # square canvas and the traced geometry maps straight onto the SVG viewBox.
    side = max(right - left, bottom - top)
    centre_x, centre_y = (left + right) / 2.0, (top + bottom) / 2.0
    origin_x, origin_y = round(centre_x - side / 2.0), round(centre_y - side / 2.0)
    disc = image.crop((origin_x, origin_y, origin_x + side, origin_y + side))
    size = disc.size[0]

    # Flatten onto the disc colour so the line art classifies cleanly.
    background = image.getpixel((round(centre_x), round(centre_y)))[:3]
    flat = Image.new("RGB", disc.size, background)
    flat.paste(disc, (0, 0), disc)

    # Blur before thresholding: the compression ringing in the source would otherwise
    # leave a ragged contour for potrace to fit, multiplying the path node count.
    span = size
    smoothed = flat.convert("L").filter(ImageFilter.GaussianBlur(TRACE_BLUR))
    luminance = np.asarray(smoothed, dtype=np.int32)
    turdsize = max(30, span // 20)
    yy, xx = np.mgrid[0:span, 0:span]
    radius = np.hypot(xx - span / 2.0 + 0.5, yy - span / 2.0 + 0.5)

    white = (luminance > WHITE_LUMINANCE) & (radius < span / 2.0)
    ring_low, ring_high = (fraction * span / 2.0 for fraction in INNER_RING)
    no_ring = white & ~((radius > ring_low) & (radius < ring_high))

    fill = "#ffffff"
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        faithful_svg = tmp_dir / "faithful.svg"
        simple_svg = tmp_dir / "simple.svg"

        write_threshold_bitmap(white, tmp_dir / "faithful.pbm")
        trace(tmp_dir / "faithful.pbm", tmp_dir / "faithful.trace.svg", turdsize)
        faithful_svg.write_text(
            compose_svg(tmp_dir / "faithful.trace.svg", span, fill, hex_color(background))
        )

        write_threshold_bitmap(no_ring, tmp_dir / "simple.pbm")
        trace(tmp_dir / "simple.pbm", tmp_dir / "simple.trace.svg", turdsize)
        simple_svg.write_text(
            compose_svg(tmp_dir / "simple.trace.svg", span, fill, hex_color(background))
        )

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        (OUT_DIR / "favicon.svg").write_text(faithful_svg.read_text())

        render(simple_svg, 16, OUT_DIR / "favicon-16.png")
        render(faithful_svg, 32, OUT_DIR / "favicon-32.png")
        render(faithful_svg, 48, OUT_DIR / "favicon-48.png")

        # Apple touch icons must be opaque and must not show the trimmed edge.
        touch_size = 180
        oversize = round(touch_size / TOUCH_KEEP)
        big = tmp_dir / "touch.png"
        render(faithful_svg, oversize, big)
        over = Image.open(big).convert("RGBA")
        inset = (oversize - touch_size) // 2
        over = over.crop((inset, inset, inset + touch_size, inset + touch_size))
        canvas = Image.new("RGB", (touch_size, touch_size), background)
        canvas.paste(over, (0, 0), over)
        canvas.save(OUT_DIR / "apple-touch-icon.png", optimize=True)

    # Legacy .ico: the tuned 16px frame alongside the faithful larger sizes.
    write_ico(
        [(size, OUT_DIR / f"favicon-{size}.png") for size in (16, 32, 48)],
        OUT_DIR / "favicon.ico",
    )

    for asset in sorted(OUT_DIR.glob("favicon*")) + [OUT_DIR / "apple-touch-icon.png"]:
        print(f"{asset.relative_to(ROOT)}  {asset.stat().st_size:>6} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

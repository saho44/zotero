#!/usr/bin/env python3
"""Erzeugt die PNG-Symbole der Erweiterung ohne externe Abhaengigkeiten.

Gezeichnet wird ein abgerundetes Quadrat in Zotero-Rot mit einem weissen Z.
Zur Kantenglaettung wird vierfach ueberabgetastet.
"""

import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)
SS = 4  # Ueberabtastung
BG = (193, 68, 46)
FG = (255, 255, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"


def rounded_square(x, y, size, radius):
    """True, wenn der Punkt im abgerundeten Quadrat liegt."""
    if x < radius and y < radius:
        return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2
    if x > size - radius and y < radius:
        return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2
    if x < radius and y > size - radius:
        return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2
    if x > size - radius and y > size - radius:
        return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2
    return 0 <= x <= size and 0 <= y <= size


def on_segment(px, py, ax, ay, bx, by, half_width):
    """Abstand eines Punktes zu einer Strecke, als Stiftbreite genutzt."""
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2 <= half_width ** 2


def glyph_strokes(size):
    """Die drei Striche des Z, relativ zur Kantenlaenge."""
    left, right = 0.28 * size, 0.72 * size
    top, bottom = 0.30 * size, 0.70 * size
    return [
        (left, top, right, top),
        (right, top, left, bottom),
        (left, bottom, right, bottom),
    ]


def render(size):
    big = size * SS
    radius = big * 0.22
    pen = big * 0.055
    strokes = glyph_strokes(big)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x * SS + sx + 0.5
                    py = y * SS + sy + 0.5
                    if not rounded_square(px, py, big, radius):
                        continue
                    inside_glyph = any(
                        on_segment(px, py, *stroke, pen) for stroke in strokes
                    )
                    color = FG if inside_glyph else BG
                    r_acc += color[0]
                    g_acc += color[1]
                    b_acc += color[2]
                    a_acc += 255
            samples = SS * SS
            if a_acc == 0:
                row += bytes((0, 0, 0, 0))
            else:
                covered = a_acc // 255
                row += bytes((
                    r_acc // covered,
                    g_acc // covered,
                    b_acc // covered,
                    a_acc // samples,
                ))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        target = OUT_DIR / f"icon-{size}.png"
        write_png(target, size, render(size))
        print(f"{target.relative_to(OUT_DIR.parent.parent)} ({target.stat().st_size} Bytes)")


if __name__ == "__main__":
    main()

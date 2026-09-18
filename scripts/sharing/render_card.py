#!/usr/bin/env python3
"""Render bounded, already-authorized public metadata as PNG. No network access."""

import io, json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

raw = sys.stdin.buffer.read(8193)
if len(raw) > 8192:
    raise SystemExit("Input bound exceeded")
data = json.loads(raw)
regular = next(
    (
        str(p)
        for p in [
            Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]
        if p.exists()
    ),
    None,
)
bold = next(
    (
        str(p)
        for p in [
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ]
        if p.exists()
    ),
    regular,
)


def font(size, strong=False):
    return (
        ImageFont.truetype(bold if strong else regular, size)
        if regular
        else ImageFont.load_default(size=size)
    )


image = Image.new("RGB", (1200, 630), "#f6f8fa")
d = ImageDraw.Draw(image)
d.rounded_rectangle(
    (36, 36, 1164, 594), radius=24, fill="#ffffff", outline="#d1d9e0", width=2
)
d.text((80, 74), "FORGEJO", font=font(26, True), fill="#24292f")
badge = "PRIVATE LINK" if data.get("private") else "PUBLIC PREVIEW"
d.text((850, 78), badge, font=font(18, True), fill="#59636e")


def lines(text, size, strong, max_width, max_lines):
    f = font(size, strong)
    result = []
    current = ""
    for word in str(text).split():
        while d.textlength(word, font=f) > max_width:
            cut = max(1, int(len(word) * max_width / d.textlength(word, font=f)) - 1)
            if current:
                result.append(current)
                current = ""
            result.append(word[:cut])
            word = word[cut:]
            if len(result) >= max_lines:
                return result[:max_lines]
        if d.textlength(current + " " + word, font=f) > max_width and current:
            result.append(current)
            current = word
        else:
            current = (current + " " + word).strip()
        if len(result) >= max_lines:
            return result[:max_lines]
    if current:
        result.append(current)
    return result[:max_lines]


y = 162
for line in lines(data.get("title", "Forgejo link"), 44, True, 1040, 3):
    d.text((80, y), line, font=font(44, True), fill="#1f2328")
    y += 55
y += 16
for line in lines(data.get("description", ""), 25, False, 1040, 3):
    d.text((80, y), line, font=font(25), fill="#59636e")
    y += 35
d.line((80, 510, 1120, 510), fill="#d1d9e0", width=2)
d.text(
    (80, 536),
    str(data.get("repository", "Forgejo"))[:65],
    font=font(22, True),
    fill="#24292f",
)
d.text((860, 537), str(data.get("status", ""))[:20], font=font(19), fill="#59636e")
buf = io.BytesIO()
image.save(buf, format="PNG", optimize=True)
sys.stdout.buffer.write(buf.getvalue())

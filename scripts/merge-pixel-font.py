#!/usr/bin/env python3
"""
Merge missing 1-bit pixel glyphs into src/data/pixel-font.json from Fusion Pixel Font 12px TTF.

Font source: https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.11.10
Release tag: 2026.11.10
Font file:   fusion-pixel-12px-monospaced-zh_hans.ttf (stored in /tmp during generation, not committed)
License:     SIL Open Font License 1.1 (OFL-1.1); see docs/fonts/OFL.txt & docs/ASSET_LEDGER.md
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

FONT_NAME = "Fusion Pixel 12px"
DEFAULT_VERSION = "2026.11.10"
FONT_SIZE = 12
LINE_HEIGHT = 12
THRESHOLD = 128

BASE_CHARS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "，。、；：？！“”‘’（）【】《》「」『』·—…×±＋－／％￥"
)

TS_TOKEN_RE = re.compile(
    r"//[^\n]*"
    r"|/\*[\s\S]*?\*/"
    r"|'((?:\\.|[^'\\\n])*)'"
    r'|"((?:\\.|[^"\\\n])*)"'
    r"|`((?:\\.|[^`\\])*)`",
)

TOFU_BOX_12 = ["111111111111"] + ["100000000001"] * 10 + ["111111111111"]


def extract_ts_strings(source: str, out: set[str]) -> None:
    for match in TS_TOKEN_RE.finditer(source):
        single, double, template = match.groups()
        if single is not None:
            out.update(single.replace("\\n", "\n").replace("\\t", " "))
        elif double is not None:
            out.update(double.replace("\\n", "\n").replace("\\t", " "))
        elif template is not None:
            out.update(template.replace("\\n", "\n").replace("\\t", " "))
            extract_ts_strings(template, out)


def collect_characters(repo_root: Path) -> list[str]:
    chars: set[str] = set(BASE_CHARS)
    src_dir = repo_root / "src"
    data_dir = src_dir / "data"

    for ts_file in sorted(src_dir.rglob("*.ts")):
        if ts_file.name == "pixelart.ts" and ts_file.parent == data_dir:
            continue
        content = ts_file.read_text(encoding="utf-8")
        extract_ts_strings(content, chars)

    filtered = [ch for ch in chars if ord(ch) >= 0x20 and ch != "\uFEFF"]
    return sorted(set(filtered), key=ord)


def render_glyph(font: ImageFont.FreeTypeFont, ch: str) -> dict[str, object]:
    raw_adv = font.getlength(ch)
    advance = max(1, int(round(raw_adv)))

    img = Image.new("L", (advance, FONT_SIZE), 0)
    draw = ImageDraw.Draw(img)
    draw.text((0, 0), ch, font=font, fill=255)

    rows: list[str] = []
    for y in range(FONT_SIZE):
        row = "".join("1" if img.getpixel((x, y)) > THRESHOLD else "0" for x in range(advance))
        rows.append(row)

    return {
        "advance": advance,
        "xoffset": 0,
        "yoffset": 0,
        "rows": rows,
    }


def merge_missing_glyphs(
    font_json_path: Path,
    ttf_path: Path,
    chars: Iterable[str],
) -> tuple[int, int]:
    payload = json.loads(font_json_path.read_text(encoding="utf-8"))
    glyphs: dict[str, dict[str, object]] = payload["glyphs"]

    missing = [ch for ch in chars if ch not in glyphs]
    if not missing:
        return 0, len(glyphs)

    font = ImageFont.truetype(str(ttf_path), FONT_SIZE)
    tofu_chars: list[str] = []
    for ch in missing:
        glyph = render_glyph(font, ch)
        if glyph["rows"] == TOFU_BOX_12:
            tofu_chars.append(ch)
        glyphs[ch] = glyph

    if tofu_chars:
        raise ValueError(
            f"Font rendered .notdef tofu box for characters: {tofu_chars!r}. "
            "Replace unsupported symbols or provide a fallback glyph."
        )

    payload["glyphs"] = dict(sorted(glyphs.items(), key=lambda kv: ord(kv[0])))
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    font_json_path.write_text(text + "\n", encoding="utf-8")
    return len(missing), len(payload["glyphs"])


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Merge missing glyphs into src/data/pixel-font.json from Fusion Pixel 12px TTF."
    )
    parser.add_argument(
        "--ttf",
        required=True,
        type=Path,
        help="Path to fusion-pixel-12px-monospaced-zh_hans.ttf (e.g. in /tmp)",
    )
    parser.add_argument(
        "--font-json",
        type=Path,
        default=repo_root / "src" / "data" / "pixel-font.json",
        help="Existing pixel-font.json path",
    )
    args = parser.parse_args()

    if not args.ttf.exists():
        raise FileNotFoundError(f"TTF not found: {args.ttf}")
    if not args.font_json.exists():
        raise FileNotFoundError(f"Font JSON not found: {args.font_json}")

    chars = collect_characters(repo_root)
    added, total = merge_missing_glyphs(args.font_json, args.ttf, chars)
    print(f"Merged {added} missing glyphs into {args.font_json} (total={total} glyphs)")


if __name__ == "__main__":
    main()

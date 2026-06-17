#!/usr/bin/env python3
"""
Remove background (white/near-white) from png/logo.png and save as png/logo_transparent.png
Requires: Pillow
Usage: python scripts/remove_bg_logo.py [--in path] [--out path] [--threshold N] [--overwrite]
"""
import sys
from pathlib import Path
from PIL import Image

def remove_background(input_path: Path, output_path: Path, threshold: int = 240, overwrite: bool = False):
    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return False
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()
    new_data = []
    for item in datas:
        r,g,b,a = item
        if r >= threshold and g >= threshold and b >= threshold:
            new_data.append((255,255,255,0))
        else:
            new_data.append((r,g,b,a))
    img.putdata(new_data)
    if output_path.exists() and not overwrite:
        print(f"Output already exists: {output_path}. Use --overwrite to replace.")
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    print(f"Saved transparent logo to: {output_path}")
    return True

if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='input', default='png/logo.png')
    p.add_argument('--out', dest='output', default='png/logo_transparent.png')
    p.add_argument('--threshold', dest='threshold', type=int, default=240)
    p.add_argument('--overwrite', dest='overwrite', action='store_true')
    args = p.parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    success = remove_background(input_path, output_path, threshold=args.threshold, overwrite=args.overwrite)
    sys.exit(0 if success else 2)

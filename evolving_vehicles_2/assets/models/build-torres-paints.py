"""Rebuild color-specific KGM photo textures from the recorded source manifest.

Requires Pillow. Run from any working directory. This preserves the full frame;
it does not recolor photographs or change the existing projection calibration.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = Path(__file__).resolve().parent / 'torres-paints/sources.json'


def rebuild(item):
    cache = ROOT / 'output/torres-paint-originals' / item['code'] / f"{item['frame']:02}.png"
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        with urlopen(item['url'], timeout=60) as response:
            cache.write_bytes(response.read())
    blob = cache.read_bytes()
    assert hashlib.sha256(blob).hexdigest() == item['sourceSha256'], 'Source changed: ' + item['url']
    image = Image.open(io.BytesIO(blob))
    assert image.size == (1660, 840)
    destination = ROOT / item['path']
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').resize((1024, 518), Image.Resampling.LANCZOS).save(destination, quality=90, subsampling=0)
    return item['path']


if __name__ == '__main__':
    items = json.loads(MANIFEST.read_text(encoding='utf-8'))['assets']
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for name in pool.map(rebuild, items):
            print(name, flush=True)

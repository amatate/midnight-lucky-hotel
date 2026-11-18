"""Package existing generated artwork. No regeneration; needs Pillow."""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageDraw

here = Path(__file__).resolve().parent
art = here.parent / 'public/art'
atlas = Image.open(art / 'room-crowns-v1.png').convert('RGBA')
out = art / 'crowns'
out.mkdir(exist_ok=True)
for tier, shape in enumerate(json.loads((here / 'room-crown-crops.json').read_text()), 1):
    x, y, width, height = shape['box']
    sprite = atlas.crop((x, y, x + width, y + height))
    mask = Image.new('L', sprite.size, 0)
    points = [tuple(map(int, pair.split(','))) for pair in shape['outline'].split()]
    ImageDraw.Draw(mask).polygon([(px - x, py - y) for px, py in points], fill=255)
    sprite.putalpha(ImageChops.multiply(sprite.getchannel('A'), mask))
    sprite.save(out / f'room-{tier}-v1.webp', quality=94, method=6)

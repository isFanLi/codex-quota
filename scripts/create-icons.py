"""Rebuild the vector-style application and menu-bar icons (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "assets"
N = 1024

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><linearGradient id="bg" x2="0.7" y2="1"><stop stop-color="#263c52"/><stop offset="1" stop-color="#111b2b"/></linearGradient>
<linearGradient id="blue"><stop stop-color="#a4e5ff"/><stop offset="1" stop-color="#56bfff"/></linearGradient>
<linearGradient id="mint"><stop stop-color="#b3f7cf"/><stop offset="1" stop-color="#52dca7"/></linearGradient></defs>
<rect x="64" y="64" width="896" height="896" rx="208" fill="url(#bg)" stroke="#425369" stroke-width="3"/>
<rect x="216" y="330" width="592" height="120" rx="60" fill="#344457"/>
<rect x="216" y="330" width="432" height="120" rx="60" fill="url(#blue)"/>
<rect x="216" y="574" width="592" height="120" rx="60" fill="#344457"/>
<rect x="216" y="574" width="320" height="120" rx="60" fill="url(#mint)"/>
<rect x="570" y="308" width="16" height="164" rx="8" fill="#f4fbff"/>
<rect x="650" y="552" width="16" height="164" rx="8" fill="#f4fbff"/></svg>
'''
(ASSETS / "app-icon.svg").write_text(svg, encoding="utf-8")
image = Image.new("RGBA", (N, N))
mask = Image.new("L", (N, N))
ImageDraw.Draw(mask).rounded_rectangle((64, 64, 960, 960), radius=208, fill=255)
pixels = image.load()
for y in range(N):
    for x in range(N):
        t = min(1, max(0, (0.3 * x + 0.7 * y) / N))
        pixels[x, y] = tuple(round(a * (1-t) + b*t) for a, b in zip((38, 60, 82), (17, 27, 43))) + (255,)
image.putalpha(mask)
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((65, 65, 959, 959), radius=208, outline=(66, 83, 105, 255), width=3)
for box, fill_end, left, right in [((216,330,808,450),648,(164,229,255),(86,191,255)), ((216,574,808,694),536,(179,247,207),(82,220,167))]:
    x0,y0,x1,y1 = box
    draw.rounded_rectangle(box, radius=60, fill=(52,68,87))
    layer = Image.new("RGBA", (N,N))
    layer_draw = ImageDraw.Draw(layer)
    for x in range(x0, fill_end+1):
        t = (x-x0)/(fill_end-x0)
        color = tuple(round(a*(1-t)+b*t) for a,b in zip(left,right)) + (255,)
        layer_draw.line((x,y0,x,y1), fill=color)
    bar_mask=Image.new("L",(N,N))
    ImageDraw.Draw(bar_mask).rounded_rectangle((x0,y0,fill_end,y1),radius=60,fill=255)
    layer.putalpha(bar_mask)
    image.alpha_composite(layer)
draw = ImageDraw.Draw(image)
for box in [(570,308,586,472),(650,552,666,716)]:
    draw.rounded_rectangle(box, radius=8, fill=(244,251,255))
image.save(ASSETS / "app-icon.png")
image.resize((256,256),Image.Resampling.LANCZOS).save(ASSETS / "app-icon-256.png")
image.save(ASSETS / "app-icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
image.save(ASSETS / "app-icon.icns")
image.resize((16,16),Image.Resampling.LANCZOS).save(ASSETS / "app-icon-tray-16.png")
for scale, suffix in [(1,""),(2,"@2x")]:
    # A single-color template automatically follows the macOS menu-bar theme.
    s = 8
    tray=Image.new("RGBA",(18*scale*s,18*scale*s))
    d=ImageDraw.Draw(tray)
    k=scale*s
    for box in [(2,4,16,7),(2,11,12,14)]:
        d.rounded_rectangle(tuple(v*k for v in box),radius=k,fill=(0,0,0,255))
    tray.resize((18*scale,18*scale),Image.Resampling.LANCZOS).save(ASSETS / f"trayTemplate{suffix}.png")
print("Created PNG, ICO, ICNS, SVG, Windows tray and macOS template icons.")

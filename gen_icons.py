from PIL import Image, ImageDraw
import os


def icon(size, filename, rounded=True):
    ss = 4  # supersample for smooth edges
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # obsidian background with a warm top-left glow
    top = (26, 31, 43)
    bottom = (7, 9, 15)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=(
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t),
            255))

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(int(S * 0.75), 0, -max(1, S // 260)):
        a = int(46 * (1 - r / (S * 0.75)))
        gd.ellipse([S * 0.12 - r, -S * 0.16 - r, S * 0.12 + r, -S * 0.16 + r],
                   fill=(217, 183, 121, a))
    img = Image.alpha_composite(img, glow)

    # gold card, tilted
    card = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cw, ch = S * 0.60, S * 0.60 / 1.586
    cx, cy = S / 2, S / 2
    x0, y0, x1, y1 = cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2
    cd.rounded_rectangle([x0, y0, x1, y1], radius=ch * 0.15, fill=(233, 205, 152, 255))
    # magnetic stripe
    cd.rectangle([x0, y0 + ch * 0.30, x1, y0 + ch * 0.30 + ch * 0.19], fill=(58, 44, 20, 255))
    # chip
    chw, chh = cw * 0.15, ch * 0.16
    chx, chy = x0 + cw * 0.10, y1 - ch * 0.30
    cd.rounded_rectangle([chx, chy, chx + chw, chy + chh], radius=chh * 0.22, fill=(150, 116, 55, 255))
    card = card.rotate(-14, resample=Image.BICUBIC, center=(cx, cy))
    img = Image.alpha_composite(img, card)

    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        img.putalpha(mask)

    img.resize((size, size), Image.LANCZOS).save(filename)


out = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out, exist_ok=True)
icon(192, os.path.join(out, "icon-192.png"))
icon(512, os.path.join(out, "icon-512.png"))
icon(180, os.path.join(out, "apple-touch-icon.png"), rounded=False)  # iOS masks it itself
print("icons generated")

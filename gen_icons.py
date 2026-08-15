from PIL import Image, ImageDraw, ImageFont
import os

def rounded_gradient_icon(size, filename, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # gradient background (deep green to teal, "money" feel)
    top = (12, 122, 92)      # #0C7A5C
    bottom = (16, 66, 90)    # #10425A
    for y in range(size):
        t = y / size
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # rounded mask
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    radius = int(size * radius_ratio)
    mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)

    # simple credit-card glyph in the center
    card_w = size * 0.6
    card_h = card_w * 0.62
    cx, cy = size / 2, size / 2
    x0, y0 = cx - card_w / 2, cy - card_h / 2
    x1, y1 = cx + card_w / 2, cy + card_h / 2
    card_radius = card_w * 0.09

    card_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card_layer)
    cdraw.rounded_rectangle([x0, y0, x1, y1], radius=card_radius, fill=(255, 255, 255, 235))
    stripe_h = card_h * 0.22
    cdraw.rectangle([x0, y0 + card_h * 0.28, x1, y0 + card_h * 0.28 + stripe_h], fill=(16, 66, 90, 255))
    dot_r = card_h * 0.09
    dot_cy = y1 - card_h * 0.22
    cdraw.ellipse([x0 + card_w * 0.62, dot_cy - dot_r, x0 + card_w * 0.62 + dot_r * 2, dot_cy + dot_r],
                  fill=(255, 196, 0, 255))
    cdraw.ellipse([x0 + card_w * 0.74, dot_cy - dot_r, x0 + card_w * 0.74 + dot_r * 2, dot_cy + dot_r],
                  fill=(255, 255, 255, 200))

    img = Image.alpha_composite(img, card_layer)
    img.save(filename)

out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)

rounded_gradient_icon(192, os.path.join(out_dir, "icon-192.png"))
rounded_gradient_icon(512, os.path.join(out_dir, "icon-512.png"))
rounded_gradient_icon(180, os.path.join(out_dir, "apple-touch-icon.png"), radius_ratio=0.0)  # iOS applies its own mask
print("icons generated")

# Builds the "kid" app icons (the hand-drawn child reaching for a star) in the two styles of the frog icons:
# classic (black drawing on paper white) and gradient (white drawing on the gradient), for every launcher density,
# plus the 512 px previews the app shows when the icon is chosen.
#   python3 scripts/make-kid-icons.py <kid drawing (black on white)>
import sys, os
from PIL import Image, ImageChops
R = 'android/app/src/main/res'
DENS = {'mdpi': (108, 48), 'hdpi': (162, 72), 'xhdpi': (216, 96), 'xxhdpi': (324, 144), 'xxxhdpi': (432, 192)}
src = Image.open(sys.argv[1]).convert('L')
# ink → alpha (soft edges kept), cropped to the drawing
alpha = src.point(lambda v: max(0, min(255, int((205 - v) * 255 / 150))))
alpha = alpha.crop(alpha.getbbox())

def drawing(size, colour):
    """the drawing centred in an adaptive-icon foreground of `size` px, as tall as the frog is (half the canvas)"""
    h = round(size * 0.47)
    w = round(alpha.width * h / alpha.height)
    a = alpha.resize((w, h), Image.LANCZOS)
    layer = Image.new('RGBA', (size, size), colour + (0,))
    ink = Image.new('RGBA', (w, h), colour + (255,))
    ink.putalpha(a)
    # optically centred: a touch above the middle, like the frog
    layer.alpha_composite(ink, ((size - w) // 2, round((size - h) / 2)))
    return layer

def legacy(bg, fg, mask_from, size):
    """the old-style square/round icon: the visible middle of the adaptive layers, cut to the existing icon's shape"""
    full = bg.copy()
    full.alpha_composite(fg)
    c = full.width / 6  # the adaptive canvas is 108dp, of which 72dp show
    out = full.crop((round(c), round(c), round(full.width - c), round(full.height - c))).resize((size, size), Image.LANCZOS)
    # only the outline of the existing icon (its square or circle), not what is drawn on it
    m = Image.open(mask_from).convert('RGBA').split()[3].point(lambda v: 255 if v > 24 else v * 10).resize((size, size), Image.LANCZOS)
    out.putalpha(ImageChops.multiply(out.split()[3], m))
    return out

PAPER = (245, 244, 240)
for d, (fs, ls) in DENS.items():
    base = f'{R}/mipmap-{d}'
    k = drawing(fs, (17, 17, 17))
    gk = drawing(fs, (255, 255, 255))
    k.save(f'{base}/ic_launcher_k_foreground.png')
    gk.save(f'{base}/ic_launcher_gk_foreground.png')
    paper = Image.new('RGBA', (fs, fs), PAPER + (255,))
    grad = Image.open(f'{base}/ic_launcher_g_background.png').convert('RGBA').resize((fs, fs))
    legacy(paper, k, f'{base}/ic_launcher.png', ls).save(f'{base}/ic_launcher_k.png')
    legacy(paper, k, f'{base}/ic_launcher_round.png', ls).save(f'{base}/ic_launcher_k_round.png')
    legacy(grad, gk, f'{base}/ic_launcher_g.png', ls).save(f'{base}/ic_launcher_gk.png')
    legacy(grad, gk, f'{base}/ic_launcher_g_round.png', ls).save(f'{base}/ic_launcher_gk_round.png')

ADAPT = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="{bg}"/>
    <foreground android:drawable="@mipmap/{fg}"/>
    <monochrome android:drawable="@mipmap/{fg}"/>
</adaptive-icon>
'''
for name, bg, fg in [('ic_launcher_k', '@color/ic_launcher_background', 'ic_launcher_k_foreground'), ('ic_launcher_gk', '@mipmap/ic_launcher_g_background', 'ic_launcher_gk_foreground')]:
    for suffix in ('', '_round'):
        open(f'{R}/mipmap-anydpi-v26/{name}{suffix}.xml', 'w').write(ADAPT.format(bg=bg, fg=fg))

# previews for the app (512 px): classic (paper and night), gradient (rounded, like icon-squircle-512)
def preview(bgcol=None, grad=False, colour=(17, 17, 17)):
    fg = drawing(768, colour)
    bg = Image.open(f'{R}/mipmap-xxxhdpi/ic_launcher_g_background.png').convert('RGBA').resize((768, 768)) if grad else Image.new('RGBA', (768, 768), bgcol + (255,))
    bg.alpha_composite(fg)
    out = bg.crop((128, 128, 640, 640))
    if grad:
        m = Image.open('public/icon-squircle-512.png').convert('RGBA').split()[3]
        out.putalpha(m)
    return out
preview(PAPER).convert('RGB').save('public/icon-kid-512.png')
preview((17, 17, 17), colour=(245, 244, 240)).convert('RGB').save('public/icon-kid-dark-512.png')
preview(grad=True, colour=(255, 255, 255)).save('public/icon-kid-gradient-512.png')
print('ok')

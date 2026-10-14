"""Planche de contrôle : réduit les captures des tests mobiles en une image par téléphone (pour relecture rapide)."""
import glob, json, os, sys
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else "captures"
out = sys.argv[2] if len(sys.argv) > 2 else "planches"
os.makedirs(out, exist_ok=True)
tel = sorted({os.path.basename(f).split("-")[0] for f in glob.glob(src + "/*.png")})
for t in tel:
    fs = sorted(glob.glob(f"{src}/{t}-*.png"), key=lambda f: (int("".join(c for c in os.path.basename(f).split("-")[1] if c.isdigit()) or 0), f))
    ims = [Image.open(f).convert("RGB") for f in fs]
    ims = [i.resize((360, int(i.height * 360 / i.width))) for i in ims]
    par = 6; lignes = [ims[k:k + par] for k in range(0, len(ims), par)]
    H = sum(max(i.height for i in l) + 10 for l in lignes); W = par * 370
    p = Image.new("RGB", (W, H), (110, 110, 110)); y = 0
    for l in lignes:
        x = 0
        for i in l: p.paste(i, (x, y)); x += 370
        y += max(i.height for i in l) + 10
    p.save(f"{out}/{t}.jpg", quality=72, optimize=True)
print("planches :", tel)

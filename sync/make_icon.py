"""Turns sync/assets/novena.png into the Windows icon (novena.ico) and the macOS one (novena.icns)."""

from pathlib import Path

from PIL import Image

here = Path(__file__).parent / "assets"
img = Image.open(here / "novena.png").convert("RGBA")
img.save(here / "novena.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.resize((512, 512), Image.LANCZOS).save(here / "novena.icns")
img.resize((128, 128), Image.LANCZOS).save(here / "window.png")  # the Tk window icon
print("wrote", ", ".join(p.name for p in sorted(here.iterdir())))

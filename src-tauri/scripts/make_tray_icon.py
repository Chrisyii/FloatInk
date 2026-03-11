from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def extract_symbol_mask(icon_path: Path) -> Image.Image:
    src = Image.open(icon_path).convert("RGBA")
    rgb = src.convert("RGB")
    _, s, v = rgb.convert("HSV").split()

    bright = v.point(lambda x: 255 if x > 110 else 0)
    colorful = s.point(lambda x: 255 if x > 95 else 0)
    mask = ImageChops.multiply(bright, colorful)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.35))
    mask = mask.point(lambda x: 255 if x > 150 else 0)

    alpha = src.split()[3].point(lambda x: 255 if x > 0 else 0)
    mask = ImageChops.multiply(mask, alpha)

    bbox = mask.getbbox()
    if bbox is None:
        raise RuntimeError("could not extract symbol from icon.png")
    return mask.crop(bbox)


def render_template_icon(mask: Image.Image, size: int, padding: int, output_path: Path) -> None:
    canvas = Image.new("L", (size, size), 0)
    target = size - padding * 2
    scale = min(target / mask.width, target / mask.height)
    new_size = (max(1, int(mask.width * scale)), max(1, int(mask.height * scale)))

    resized = mask.resize(new_size, Image.Resampling.LANCZOS)
    offset = ((size - new_size[0]) // 2, (size - new_size[1]) // 2)
    canvas.paste(resized, offset)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.15 if size <= 22 else 0.25))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.putalpha(canvas)
    out.save(output_path)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    icons_dir = root / "icons"
    mask = extract_symbol_mask(icons_dir / "icon.png")

    render_template_icon(mask, 22, 2, icons_dir / "tray.png")
    render_template_icon(mask, 44, 5, icons_dir / "tray@2x.png")
    print("Generated icons/tray.png and icons/tray@2x.png from icons/icon.png")

#!/usr/bin/env python3
"""Generate Discord's animated 20-game Nebula Arcade showcase asset."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/brand/nebula-arcade-games-showcase.gif"
ICON = ROOT / "public/brand/chat-tag-icon-512.png"
WIDTH, HEIGHT = 1200, 675
OUTPUT_WIDTH, OUTPUT_HEIGHT = 800, 450

GAMES = [
    ("Chat Tag", "core", "Persistent cross-channel community tag"),
    ("Quackverse", "core", "Duck cards, collections and room battles"),
    ("Chaos Mode", "party", "Every chat message raises the chaos"),
    ("Chat Garden", "creative", "Grow a shared garden through chat"),
    ("Chat Wars", "strategy", "Color teams fight for territory"),
    ("Chicken Royale", "race", "Last chicken standing wins"),
    ("Color Symphony", "music", "Color words become music and light"),
    ("Color Wars", "strategy", "Paint the board for your team"),
    ("Dancing Parade", "party", "Chatters dance in one parade"),
    ("Emoji Rain", "party", "Every emoji falls into the overlay"),
    ("Emoji Tower", "party", "Stack the tallest community tower"),
    ("Memory Lane", "creative", "Stories become drifting memory cards"),
    ("Pet Race", "race", "Enter a pet in a quick live race"),
    ("Phrase Guess", "word", "Race to solve the hidden phrase"),
    ("Pixel Battle", "creative", "Paint a shared canvas together"),
    ("Rhythm Pulse", "music", "Chat generates beats and combos"),
    ("Treasure Hunt", "strategy", "Dig the grid with hot and cold clues"),
    ("Word Chain", "word", "Extend the chain one word at a time"),
    ("Word Storm", "word", "Popular chat words become a storm"),
    ("Bingo", "party", "A shared board with personal center squares"),
]

ACCENTS = {
    "core": (103, 232, 249),
    "party": (244, 114, 182),
    "creative": (167, 139, 250),
    "strategy": (74, 222, 128),
    "race": (251, 146, 60),
    "music": (250, 204, 21),
    "word": (96, 165, 250),
}


def font(size: int, bold: bool = False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


def rounded_text(draw, xy, text, fill, background, text_font, padding=(18, 9), radius=18):
    left, top = xy
    box = draw.textbbox((0, 0), text, font=text_font)
    width = box[2] - box[0] + padding[0] * 2
    height = box[3] - box[1] + padding[1] * 2
    draw.rounded_rectangle((left, top, left + width, top + height), radius=radius, fill=background)
    draw.text((left + padding[0], top + padding[1] - box[1]), text, font=text_font, fill=fill)


def frame_for(index: int, game):
    name, category, description = game
    accent = ACCENTS[category]
    image = Image.new("RGB", (WIDTH, HEIGHT), (3, 7, 20))
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            glow_a = max(0.0, 1.0 - (((x - 170) / 680) ** 2 + ((y - 40) / 520) ** 2))
            glow_b = max(0.0, 1.0 - (((x - 1050) / 760) ** 2 + ((y - 650) / 600) ** 2))
            pixels[x, y] = (
                min(255, int(3 + accent[0] * glow_a * 0.22 + 93 * glow_b * 0.16)),
                min(255, int(7 + accent[1] * glow_a * 0.18 + 66 * glow_b * 0.12)),
                min(255, int(20 + accent[2] * glow_a * 0.22 + 210 * glow_b * 0.18)),
            )

    rng = random.Random(2026)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(135):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        alpha = rng.randrange(35, 125)
        radius = 2 if rng.random() > 0.9 else 1
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 255, 255, alpha))

    draw.rounded_rectangle((45, 38, WIDTH - 45, HEIGHT - 38), radius=34, fill=(2, 6, 18, 190), outline=(*accent, 105), width=2)
    draw.line((80, 135, WIDTH - 80, 135), fill=(255, 255, 255, 32), width=2)

    icon = Image.open(ICON).convert("RGBA")
    icon.thumbnail((82, 82), Image.Resampling.LANCZOS)
    image.paste(icon, (77, 48), icon)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.text((175, 57), "NEBULA ARCADE", font=font(32, True), fill=(245, 248, 255, 255))
    draw.text((177, 98), "ONE BOT  •  TWENTY GAMES", font=font(15, True), fill=(*accent, 230))
    rounded_text(draw, (955, 69), f"{index + 1:02d} / {len(GAMES)}", (255, 255, 255, 245), (*accent, 55), font(18, True))

    rounded_text(draw, (85, 188), category.upper(), (*accent, 255), (*accent, 35), font(15, True), padding=(18, 8))
    title_size = 68 if len(name) <= 14 else 58
    draw.text((82, 253), name, font=font(title_size, True), fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(255, 255, 255, 45))
    draw.text((86, 350), description, font=font(26), fill=(203, 213, 225, 255))

    draw.rounded_rectangle((82, 438, WIDTH - 82, 535), radius=22, fill=(255, 255, 255, 13), outline=(255, 255, 255, 25), width=1)
    start = max(0, min(index - 2, len(GAMES) - 5))
    visible = GAMES[start:start + 5]
    slot_width = (WIDTH - 196) // 5
    for offset, visible_game in enumerate(visible):
        game_index = start + offset
        left = 98 + offset * slot_width
        active = game_index == index
        if active:
            draw.rounded_rectangle((left - 8, 455, left + slot_width - 13, 519), radius=15, fill=(*accent, 50), outline=(*accent, 170), width=2)
        draw.text((left, 470), visible_game[0], font=font(14, active), fill=(255, 255, 255, 245) if active else (148, 163, 184, 220))

    draw.text((84, 586), "LIVE-CHAT GAMES  •  OPEN THE ARCADE TO PLAY", font=font(16, True), fill=(148, 163, 184, 230))
    for game_index in range(len(GAMES)):
        x = 788 + game_index * 15
        fill = (*accent, 255) if game_index == index else (255, 255, 255, 55)
        draw.ellipse((x, 588, x + 7, 595), fill=fill)

    image = image.resize((OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS)
    return image.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def main():
    frames = [frame_for(index, game) for index, game in enumerate(GAMES)]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=2900,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024 / 1024:.2f} MiB, {len(frames)} frames)")


if __name__ == "__main__":
    main()

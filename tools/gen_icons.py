import os
import struct
import sys
import zlib

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return int(round(a + (b - a) * t))


def pixel(x, y, n):
    nx, ny = x / n, y / n

    def box(x0, x1, y0, y1):
        return x0 <= nx <= x1 and y0 <= ny <= y1

    # white dumbbell, kept within the central maskable safe zone
    white = (
        box(0.32, 0.68, 0.47, 0.53)    # handle
        or box(0.27, 0.345, 0.36, 0.64)  # left plate
        or box(0.655, 0.73, 0.36, 0.64)  # right plate
        or box(0.215, 0.27, 0.42, 0.58)  # left cap
        or box(0.73, 0.785, 0.42, 0.58)  # right cap
    )
    if white:
        return (255, 255, 255)
    top, bot = (99, 91, 255), (67, 56, 202)  # indigo vertical gradient
    return (lerp(top[0], bot[0], ny), lerp(top[1], bot[1], ny), lerp(top[2], bot[2], ny))


def write_png(path, n):
    raw = bytearray()
    for y in range(n):
        raw.append(0)  # filter type 0 for each scanline
        for x in range(n):
            raw += bytes(pixel(x, y, n))

    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "icon-180.png")]:
    write_png(os.path.join(OUT, name), size)
    print("wrote", name)

"""
Build a seamless, endlessly-looping hero clip from the restaurant still.

Every value below is periodic over the whole clip (one full sine / cosine cycle),
so frame 0 and the last frame line up exactly and the loop has no visible jump.
"""
import subprocess, numpy as np, cv2

SRC = "/home/user/burger-shop/public/images/restaurant.jpg"
OUT = "/home/user/burger-shop/public/hero.mp4"

W, H, FPS, DUR = 1280, 720, 30, 16.0
N = int(DUR * FPS)

src = cv2.cvtColor(cv2.imread(SRC, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
sh, sw = src.shape[:2]

# a canvas a little larger than the frame, so the camera has room to travel
CH = int(round(H * 1.14))
CW = int(round(CH * sw / sh))
work = cv2.resize(src, (CW, CH), interpolation=cv2.INTER_LANCZOS4)
print(f"source {sw}x{sh} -> canvas {CW}x{CH} -> frame {W}x{H}")

AMP_X = (CW - W) * 0.34          # half the travel
AMP_Y = (CH - H) * 0.30

xg = np.tile((np.arange(W, dtype=np.float32) / (W - 1))[None, :], (H, 1))
yg = np.tile((np.arange(H, dtype=np.float32) / (H - 1))[:, None], (1, W))

# parallax: the near floor slides more than the far shelves
yy = (np.arange(H, dtype=np.float32) / (H - 1))[:, None]
k = 0.42 + 0.58 * (np.clip((yy - 0.15) / 0.85, 0, 1) ** 1.25)
k = np.tile(k, (1, W)).astype(np.float32)
K_REF = 0.70

bx = (np.arange(W, dtype=np.float32) / W)[None, :]
by = (np.arange(H, dtype=np.float32) / H)[:, None]

proc = subprocess.Popen([
    "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
    "-r", str(FPS), "-i", "-", "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT,
], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

TAU = 2 * np.pi
for f in range(N):
    t = f / N                       # 0 … 1, exclusive, so t=1 == t=0

    # one full cycle: starts far left, drifts right, comes back — no seam
    dx = AMP_X * np.sin(TAU * t - np.pi / 2)
    dy = AMP_Y * 0.45 * np.sin(TAU * t)
    z = 1.0 + 0.026 * (1 - np.cos(TAU * t)) / 2          # breathe in and out once

    win_w, win_h = CW / z, CH / z
    win_x = (CW - win_w) / 2 + dx
    win_y = (CH - win_h) / 2 + dy

    map_x = np.clip((win_x + xg * win_w + dx * (k - K_REF)), 0, CW - 1).astype(np.float32)
    map_y = np.clip((win_y + yg * win_h), 0, CH - 1).astype(np.float32)

    frame = cv2.remap(work, map_x, map_y, interpolation=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # a soft band of afternoon light sweeping once per loop
    gx = 0.5 + 0.38 * np.sin(TAU * t - 1.0)
    glow = np.exp(-((bx - gx) ** 2) / (2 * 0.20 ** 2)) * np.exp(-((by - 0.34) ** 2) / (2 * 0.32 ** 2))
    frame = 1.0 - (1.0 - frame) * (1.0 - glow[..., None] * 0.07)

    # gentle vignette + warmth, identical on every frame
    vx, vy = (bx - 0.5) * 2.0, (by - 0.5) * 2.0
    vig = 1.0 - 0.20 * np.clip(vx ** 2 * 0.55 + vy ** 2 * 0.70 - 0.24, 0, 1) ** 1.3
    frame = frame * vig[..., None]
    frame = np.clip(frame, 0, 1) ** 0.99
    frame[..., 2] *= 0.988

    # a light unsharp so a 900 px source still reads crisp at 720p
    blur = cv2.GaussianBlur(frame, (0, 0), 0.9)
    frame = np.clip(frame + (frame - blur) * 0.45, 0, 1)

    proc.stdin.write((frame * 255).astype(np.uint8).tobytes())

proc.stdin.close()
proc.wait()
print("frames", N, "exit", proc.returncode)

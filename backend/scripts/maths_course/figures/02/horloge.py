"""Z/12Z vu comme une horloge : 14 et 2 tombent sur la même position."""
import numpy as np
import matplotlib.pyplot as plt
from _style import BLUE, GREY, ORANGE

fig, ax = plt.subplots(figsize=(4.5, 4.5))
ax.add_patch(plt.Circle((0, 0), 1, fill=False, color=GREY, lw=1.5))
for k in range(12):
    angle = np.pi / 2 - 2 * np.pi * k / 12
    x, y = np.cos(angle), np.sin(angle)
    color = ORANGE if k == 2 else BLUE
    ax.plot(x, y, "o", color=color, ms=7)
    ax.text(1.18 * x, 1.18 * y, rf"$\overline{{{k}}}$", ha="center", va="center", fontsize=13, color=color)
# arc 0 -> 14 : un tour complet puis 2 crans
t = np.linspace(0, 2 * np.pi * 14 / 12, 300)
r = 0.55 + 0.25 * t / t[-1]
ax.plot(r * np.cos(np.pi / 2 - t), r * np.sin(np.pi / 2 - t), color=ORANGE, lw=1.5)
end = np.pi / 2 - t[-1]
ax.annotate("", xy=(0.82 * np.cos(end), 0.82 * np.sin(end)), xytext=(0.78 * np.cos(end + 0.15), 0.78 * np.sin(end + 0.15)),
            arrowprops=dict(arrowstyle="-|>", color=ORANGE))
ax.text(0, 0, r"$14 \equiv 2\ [12]$", ha="center", va="center", fontsize=14, color=ORANGE)
ax.set_xlim(-1.4, 1.4)
ax.set_ylim(-1.4, 1.4)
ax.set_aspect("equal")
ax.axis("off")

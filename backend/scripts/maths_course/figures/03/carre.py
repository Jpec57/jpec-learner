"""Groupe diédral D4 : les 4 axes de symétrie du carré et sa rotation d'un quart de tour."""
import numpy as np
import matplotlib.pyplot as plt
from _style import BLUE, GREEN, GREY, ORANGE, LIGHT

fig, ax = plt.subplots(figsize=(4.8, 4.8))
square = np.array([[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]])
ax.fill(square[:, 0], square[:, 1], color=LIGHT)
ax.plot(square[:, 0], square[:, 1], color=BLUE, lw=2)
for label, (x, y) in zip("ABCD", square[:4]):
    ax.text(1.18 * x, 1.18 * y, label, ha="center", va="center", fontsize=13, color=BLUE)
axes = [((-1.5, 0), (1.5, 0)), ((0, -1.5), (0, 1.5)), ((-1.4, -1.4), (1.4, 1.4)), ((-1.4, 1.4), (1.4, -1.4))]
for (x0, y0), (x1, y1) in axes:
    ax.plot([x0, x1], [y0, y1], "--", color=GREEN, lw=1.2)
ax.text(1.55, 0.08, "4 réflexions", color=GREEN, fontsize=11)
theta = np.linspace(0.2, np.pi / 2 - 0.2, 50)
ax.plot(0.45 * np.cos(theta), 0.45 * np.sin(theta), color=ORANGE, lw=1.5)
ax.annotate("", xy=(0.45 * np.cos(theta[-1]), 0.45 * np.sin(theta[-1])),
            xytext=(0.45 * np.cos(theta[-3]), 0.45 * np.sin(theta[-3])), arrowprops=dict(arrowstyle="-|>", color=ORANGE))
ax.plot(0, 0, "o", color=ORANGE, ms=5)
ax.text(0.35, 0.55, r"$r$ : rotation de $\pi/2$", color=ORANGE, fontsize=11)
ax.text(-1.5, -1.85, r"$D_4=\{\mathrm{id}, r, r^2, r^3\}\cup\{4$ réflexions$\}$, d'ordre 8", color=GREY, fontsize=11)
ax.set_xlim(-1.9, 2.6)
ax.set_ylim(-2.0, 1.7)
ax.set_aspect("equal")
ax.axis("off")

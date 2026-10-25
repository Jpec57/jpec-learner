"""Projection p sur F parallèlement à G, et symétrie s = 2p - id, dans le plan."""
import numpy as np
import matplotlib.pyplot as plt
from _style import BLUE, GREEN, GREY, ORANGE, vector

f = np.array([1.0, 0.25])  # direction de F
g = np.array([0.45, 1.0])  # direction de G
x = 2.2 * f + 1.1 * g
p = 2.2 * f
s = 2.2 * f - 1.1 * g
fig, ax = plt.subplots(figsize=(6, 4.2))
for d, name, color in ((f, "F", BLUE), (g, "G", GREEN)):
    t = np.array([-1.6, 3.2])
    ax.plot(t * d[0], t * d[1], color=color, lw=1.2)
    ax.text(3.25 * d[0], 3.25 * d[1], name, color=color, fontsize=13)
ax.plot([x[0], s[0]], [x[1], s[1]], "--", color=GREY, lw=1)
vector(ax, (0, 0), x, color="black", label=r"$x$")
vector(ax, (0, 0), p, color=ORANGE, label=r"$p(x)$", offset=(4, -16))
vector(ax, (0, 0), s, color=BLUE, label=r"$s(x)$", offset=(6, -6))
ax.plot(0, 0, "o", color="black", ms=3)
ax.set_aspect("equal")
ax.axis("off")

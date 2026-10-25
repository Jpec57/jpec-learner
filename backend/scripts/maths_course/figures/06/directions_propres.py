"""Image du cercle unité par A(x,y) = (2x+y, x+2y) : les directions propres sont simplement dilatées (×3 et ×1)."""
import numpy as np
import matplotlib.pyplot as plt
from _style import BLUE, GREEN, GREY, ORANGE, vector

A = np.array([[2.0, 1.0], [1.0, 2.0]])
t = np.linspace(0, 2 * np.pi, 300)
circle = np.vstack([np.cos(t), np.sin(t)])
image = A @ circle
fig, ax = plt.subplots(figsize=(5.5, 5.0))
ax.plot(circle[0], circle[1], color=GREY, lw=1.2, label="cercle unité")
ax.plot(image[0], image[1], color=BLUE, lw=2, label=r"image par $A$")
v1 = np.array([1, 1]) / np.sqrt(2)
v2 = np.array([1, -1]) / np.sqrt(2)
for v, lam, color, name in ((v1, 3, ORANGE, r"$v_1$, $\lambda=3$"), (v2, 1, GREEN, r"$v_2$, $\lambda=1$")):
    ax.plot([-3.2 * v[0], 3.2 * v[0]], [-3.2 * v[1], 3.2 * v[1]], ":", color=color, lw=1)
    vector(ax, (0, 0), lam * v, color=color, label=name, offset=(6, 4) if lam == 3 else (10, -4))
ax.text(-3.1, 2.7, r"$A(x,y)=(2x+y,\ x+2y)$", fontsize=13)
ax.legend(loc="lower right", frameon=False)
ax.set_xlim(-3.3, 3.3)
ax.set_ylim(-3.3, 3.3)
ax.set_aspect("equal")
ax.axis("off")

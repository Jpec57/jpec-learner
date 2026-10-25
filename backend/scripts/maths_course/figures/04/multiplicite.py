"""Racine simple (le graphe traverse l'axe) contre racine double (il y est tangent)."""
import numpy as np
import matplotlib.pyplot as plt
from _style import BLUE, ORANGE, centered_axes, mark

x = np.linspace(-1.6, 2.4, 400)
P = (x + 1) * (x - 1.5) ** 2 / 2
fig, ax = plt.subplots(figsize=(6, 3.8))
centered_axes(ax)
ax.plot(x, P, color=BLUE, lw=2)
ax.set_ylim(-1.6, 2.4)
mark(ax, -1, r"$-1$ : racine simple", color=BLUE)
mark(ax, 1.5, r"$3/2$ : racine double", color=ORANGE)
ax.text(-1.5, 1.9, r"$P=\frac{1}{2}(X+1)\left(X-\frac{3}{2}\right)^2$", fontsize=13, color=BLUE)

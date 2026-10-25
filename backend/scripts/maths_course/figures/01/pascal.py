"""Triangle de Pascal, avec une règle de Pascal mise en évidence."""
from math import comb

import matplotlib.pyplot as plt
from _style import BLUE, GREY, LIGHT, ORANGE

N = 7
fig, ax = plt.subplots(figsize=(6, 4))
for n in range(N):
    for k in range(n + 1):
        x, y = k - n / 2, -n
        highlight = (n, k) in {(4, 1), (4, 2)}
        result = (n, k) == (5, 2)
        color = ORANGE if result else (BLUE if highlight else "black")
        if highlight or result:
            ax.add_patch(plt.Circle((x, y), 0.32, color=LIGHT, zorder=0))
        ax.text(x, y, str(comb(n, k)), ha="center", va="center", fontsize=13, color=color)
ax.annotate("", xy=(-0.5 + 0.12, -5 + 0.28), xytext=(-1 + 0.05, -4 - 0.25), arrowprops=dict(arrowstyle="->", color=GREY))
ax.annotate("", xy=(-0.5 - 0.02, -5 + 0.28), xytext=(0 - 0.05, -4 - 0.25), arrowprops=dict(arrowstyle="->", color=GREY))
ax.text(1.0, -6.75, r"$\binom{4}{1}+\binom{4}{2}=\binom{5}{2}$", fontsize=14, color=ORANGE, va="center")
ax.text(-4.6, 0, r"$n=0$", color=GREY, va="center")
ax.text(-4.6, -6, r"$n=6$", color=GREY, va="center")
ax.set_xlim(-4.8, 4.8)
ax.set_ylim(-7.2, 0.6)
ax.axis("off")

"""Théorème du rang : E = ker u ⊕ S, et u restreinte à S est un isomorphisme sur Im u."""
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, FancyArrowPatch
from _style import BLUE, GREEN, GREY, LIGHT, ORANGE

fig, ax = plt.subplots(figsize=(6.5, 3.6))
ax.add_patch(Ellipse((0, 0), 3.0, 3.2, color=LIGHT))
ax.add_patch(Ellipse((0, 0.75), 2.2, 1.1, fill=False, color=GREY, lw=1.5))
ax.add_patch(Ellipse((0, -0.75), 2.2, 1.1, fill=False, color=GREEN, lw=1.5))
ax.text(0, 0.75, r"$\ker u$", ha="center", va="center", fontsize=13, color=GREY)
ax.text(0, -0.75, r"$S$", ha="center", va="center", fontsize=12, color=GREEN)
ax.text(0, 1.85, r"$E$", ha="center", fontsize=14, color=BLUE)
ax.add_patch(Ellipse((5, 0), 3.0, 3.2, color=LIGHT))
ax.add_patch(Ellipse((5, -0.4), 2.2, 1.6, fill=False, color=ORANGE, lw=1.5))
ax.text(5, -0.75, r"$\mathrm{Im}\,u$", ha="center", va="center", fontsize=13, color=ORANGE)
ax.text(5, 1.85, r"$F$", ha="center", fontsize=14, color=BLUE)
ax.add_patch(FancyArrowPatch((1.1, -0.75), (3.9, -0.45), arrowstyle="-|>", mutation_scale=15, color=GREEN, lw=1.5))
ax.text(2.5, -0.35, r"$u_{|S}$ : isomorphisme", ha="center", fontsize=11, color=GREEN)
ax.plot(5, -0.1, "o", color=GREY, ms=4)
ax.text(5.15, -0.05, r"$0$", color=GREY, fontsize=12)
ax.add_patch(FancyArrowPatch((1.1, 0.75), (4.92, -0.05), arrowstyle="-|>", mutation_scale=15, color=GREY, lw=1, linestyle="--",
                             connectionstyle="arc3,rad=-0.15"))
ax.text(2.6, 0.75, r"$\mapsto 0$", fontsize=12, color=GREY)
ax.text(2.5, -2.1, r"$\dim E=\dim\ker u+\mathrm{rg}\,u$", ha="center", fontsize=14, color="black")
ax.set_xlim(-1.8, 6.8)
ax.set_ylim(-2.4, 2.2)
ax.set_aspect("equal")
ax.axis("off")

"""Shared colours and helpers for the course figures (imported by figure scripts)."""

import matplotlib.pyplot as plt

BLUE = "#2563eb"  # main object (graph, vector, set)
ORANGE = "#ea580c"  # what the theorem produces (tangent, image, limit)
GREEN = "#16a34a"  # auxiliary construction
GREY = "#64748b"  # guides, axes, dashed helpers
LIGHT = "#dbeafe"  # filled regions


def centered_axes(ax=None, xlabel="x", ylabel="y"):
    """Axes crossing at the origin, arrows-free, ticks hidden: the usual blackboard look."""
    ax = ax or plt.gca()
    for side in ("left", "bottom"):
        ax.spines[side].set_position("zero")
        ax.spines[side].set_color(GREY)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.annotate(xlabel, xy=(1, 0), xycoords=("axes fraction", "data"), ha="left", va="center", color=GREY)
    ax.annotate(ylabel, xy=(0, 1), xycoords=("data", "axes fraction"), ha="center", va="bottom", color=GREY)
    return ax


def mark(ax, x, label, y=0, color=GREY, va="top"):
    """A labelled tick on the x-axis (e.g. a, b, c)."""
    ax.plot([x], [y], "o", color=color, ms=4)
    ax.annotate(label, (x, y), textcoords="offset points", xytext=(0, -12 if va == "top" else 8), ha="center", color=color)


def vector(ax, origin, tip, color=BLUE, label=None, offset=(6, 6)):
    ax.annotate("", xy=tip, xytext=origin, arrowprops=dict(arrowstyle="-|>", color=color, lw=2))
    if label:
        ax.annotate(label, tip, textcoords="offset points", xytext=offset, color=color)

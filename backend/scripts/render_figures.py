"""Renders the maths course figures: maths_course/figures/**/<name>.py -> <name>.png.

Each figure script draws on the current matplotlib figure (plt.figure(...) / plt.subplots(...)).
This runner styles it and saves it next to the script. Figures go on a white background
because the backend re-encodes uploads as JPEG, which has no transparency.

Needs matplotlib, which lives in a dedicated venv so the importer stays standard-library only:

    python3 -m venv backend/scripts/.venv
    backend/scripts/.venv/bin/pip install -r backend/scripts/maths_course/requirements-figures.txt
    backend/scripts/.venv/bin/python backend/scripts/render_figures.py            # changed figures only
    backend/scripts/.venv/bin/python backend/scripts/render_figures.py --force 05  # all of chapter 05
"""

import argparse
import runpy
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

FIGURES_DIR = Path(__file__).resolve().parent / "maths_course" / "figures"
sys.path.insert(0, str(FIGURES_DIR))  # lets figure scripts `from _style import ...`

plt.rcParams.update(
    {
        "figure.figsize": (6, 4),
        "figure.dpi": 100,
        "font.size": 12,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": False,
        "mathtext.fontset": "cm",
        "savefig.facecolor": "white",
    }
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("chapters", nargs="*", help="chapter folders to render (e.g. 05); default: all")
    parser.add_argument("--force", action="store_true", help="re-render even when the PNG is up to date")
    args = parser.parse_args()

    scripts = sorted(p for p in FIGURES_DIR.glob("*/*.py") if not p.name.startswith("_"))
    if args.chapters:
        scripts = [p for p in scripts if p.parent.name in args.chapters]
    rendered = failed = 0
    for script in scripts:
        png = script.with_suffix(".png")
        if not args.force and png.exists() and png.stat().st_mtime >= script.stat().st_mtime:
            continue
        plt.close("all")
        try:
            runpy.run_path(str(script), run_name="__main__")
            figure = plt.gcf()
            figure.tight_layout()
            figure.savefig(png, dpi=150, bbox_inches="tight")
            rendered += 1
            print(f"rendered {png.relative_to(FIGURES_DIR)}")
        except Exception as error:  # report every broken figure, not just the first
            failed += 1
            print(f"FAILED {script.relative_to(FIGURES_DIR)}: {error}", file=sys.stderr)
    print(f"{rendered} rendered, {failed} failed, {len(scripts) - rendered - failed} up to date")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

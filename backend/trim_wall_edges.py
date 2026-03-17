"""
Trim edge artifacts (glass effect) from existing wall images.
Usage: python trim_wall_edges.py [path_to_wall.jpg]
       python trim_wall_edges.py  (trims all wall_*.jpg in output/Walls/)
"""
import sys
from pathlib import Path

import cv2

# Add parent for imports
sys.path.insert(0, str(Path(__file__).parent))
from stitch_equirect import trim_edge_artifacts, WALL_EDGE_TRIM_PERCENT

TRIM_PERCENT = WALL_EDGE_TRIM_PERCENT
WALLS_DIR = Path(__file__).parent / "output" / "Walls"


def trim_file(path: Path) -> bool:
    img = cv2.imread(str(path))
    if img is None:
        print(f"  Skipped (cannot read): {path}")
        return False
    trimmed = trim_edge_artifacts(img, trim_percent=TRIM_PERCENT)
    if trimmed.shape[1] == img.shape[1]:
        print(f"  No change: {path}")
        return False
    cv2.imwrite(str(path), trimmed)
    print(f"  Trimmed {img.shape[1]} -> {trimmed.shape[1]} px: {path}")
    return True


def main():
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        walls_dir = WALLS_DIR
        paths = list(walls_dir.glob("wall_*.jpg")) if walls_dir.exists() else []
        if not paths:
            print(f"No wall_*.jpg found in {walls_dir}")
            return
    print(f"Trimming {TRIM_PERCENT}% from each side of {len(paths)} file(s)...")
    for p in paths:
        trim_file(p)


if __name__ == "__main__":
    main()

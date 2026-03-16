"""
Balanced 360° panorama stitcher.
Same as reference: Stitcher.create(), prepare_image, crop_black_borders, enforce_equirectangular.
No pitch/yaw — only image paths; pass clicked images and get stitched 360° panorama.

Tune PANO_CONFIDENCE to trade off quality vs coverage:
- Higher (0.7–0.85): cleaner stitching, may leave out some images (incomplete 360).
- Lower (0.5–0.65): uses more images (fuller 360), risk of warping/clustering.
"""
import cv2
import numpy as np

cv2.ocl.setUseOpenCL(False)

# ===============================
# CONFIGURATION (same as reference)
# ===============================
MAX_IMAGE_DIMENSION = 2000
MAX_IMAGE_DIMENSION_MANY_IMAGES = 1000  # Smaller for 5+ images to avoid camera params fail
MAX_IMAGES_FOR_FAST_MODE = 4
STITCH_MODE = cv2.Stitcher_PANORAMA
PANO_CONFIDENCE = 0.4  # Lower = more lenient (0.3–0.5 helps with overlap)


def prepare_image(img_path: str, max_dim: int | None = None) -> np.ndarray | None:
    if max_dim is None:
        max_dim = MAX_IMAGE_DIMENSION
    img = cv2.imread(str(img_path))
    if img is None:
        return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def crop_to_content(image: np.ndarray, black_thresh: int = 15) -> np.ndarray:
    """
    Crop to exact stitched content — no black bg, no empty space.
    Treats pixels darker than black_thresh as empty.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, black_thresh, 255, cv2.THRESH_BINARY)
    x, y, w, h = cv2.boundingRect(thresh)
    if w <= 0 or h <= 0:
        return image
    return image[y : y + h, x : x + w].copy()


def crop_black_borders(image: np.ndarray) -> np.ndarray:
    """Alias for crop_to_content (legacy)."""
    return crop_to_content(image)


def enforce_equirectangular(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    target_h = w // 2
    if h != target_h:
        image = cv2.resize(image, (w, target_h), interpolation=cv2.INTER_LINEAR)
    return image


def create_stitcher(mode: int | None = None):
    m = mode if mode is not None else STITCH_MODE
    try:
        stitcher = cv2.Stitcher.create(m)
    except AttributeError:
        stitcher = cv2.Stitcher_create(m)
    try:
        stitcher.setPanoConfidenceThresh(PANO_CONFIDENCE)
    except AttributeError:
        pass
    return stitcher


def stitch_panorama(image_paths: list[str], *, single_wall: bool = False) -> np.ndarray:
    """
    Stitch clicked images into panorama.
    Needs at least 2 images.
    - single_wall=False: full 360° output (crop black borders, enforce 2:1 equirectangular).
    - single_wall=True: natural output for one side only (crop black borders, no enforce).
    Retries with smaller images if camera params adjustment fails (common with many/large images).
    """
    if len(image_paths) < 2:
        raise ValueError("Need at least 2 images to stitch")

    def _try_stitch(max_dim: int, mode: int | None = None) -> tuple[int, np.ndarray | None]:
        images = []
        for p in image_paths:
            img = prepare_image(p, max_dim=max_dim)
            if img is not None:
                images.append(img)
        if len(images) < 2:
            return -1, None
        stitcher = create_stitcher(mode)
        status, result = stitcher.stitch(images)
        return status, result if status == cv2.Stitcher_OK else None

    max_dim = (
        MAX_IMAGE_DIMENSION_MANY_IMAGES
        if len(image_paths) > MAX_IMAGES_FOR_FAST_MODE
        else MAX_IMAGE_DIMENSION
    )
    status, result = _try_stitch(max_dim)

    # Cascade retry: smaller images, then SCANS mode (different camera model)
    if status == cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL:
        for fallback_dim in [800, 600, 500]:
            if max_dim > fallback_dim:
                status, result = _try_stitch(fallback_dim)
                if status == cv2.Stitcher_OK:
                    break
        # Try SCANS mode (affine model, sometimes works when PANORAMA fails)
        if status == cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL:
            try:
                scans_mode = getattr(cv2, "Stitcher_SCANS", 1)
                for dim in [800, 600, 500]:
                    status, result = _try_stitch(dim, mode=scans_mode)
                    if status == cv2.Stitcher_OK:
                        break
            except Exception:
                pass

    status_map = {
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "Need more images",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "Homography estimation failed",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "Camera parameter adjustment failed",
    }
    if status != cv2.Stitcher_OK or result is None:
        raise ValueError(status_map.get(status, f"Stitching failed (code {status})"))

    result = crop_to_content(result)
    if not single_wall:
        result = enforce_equirectangular(result)
    return result

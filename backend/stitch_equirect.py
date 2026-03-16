"""
Balanced 360° panorama stitcher.
Same as reference: Stitcher.create(), prepare_image, crop_black_borders, enforce_equirectangular.
No pitch/yaw — only image paths; pass clicked images and get stitched 360° panorama.

Tune PANO_CONFIDENCE to trade off quality vs coverage:
- Higher (0.7–0.85): cleaner stitching, may leave out some images (incomplete 360).
- Lower (0.5–0.65): uses more images (fuller 360), risk of warping/clustering.

Wall stitching (single_wall=True): uses affine/SCANS mode, wave correction, exposure hints.
"""
import cv2
import numpy as np

cv2.ocl.setUseOpenCL(False)

# ===============================
# CONFIGURATION
# ===============================
MAX_IMAGE_DIMENSION = 2000
MAX_IMAGE_DIMENSION_MANY_IMAGES = 1000  # Smaller for 5+ images to avoid camera params fail
MAX_IMAGES_FOR_FAST_MODE = 4
STITCH_MODE = cv2.Stitcher_PANORAMA
PANO_CONFIDENCE = 0.4  # Lower = more lenient for full 360°
PANO_CONFIDENCE_WALL = 0.4  # Lenient for walls so more content is included (fewer black gaps)

# Wall output: keep natural proportions (no forced aspect ratio) to avoid squeezing + black padding.
WALL_MAX_DIMENSION = 2000  # Max width or height of output; scale down if larger
WALL_INPAINT_RADIUS = 5  # Inpaint small black gaps from stitching (0 = disabled)


def _normalize_exposure(img: np.ndarray) -> np.ndarray:
    """Light exposure normalization to reduce color drift between shots."""
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        lab = cv2.merge([l, a, b])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    except Exception:
        return img


def prepare_image(
    img_path: str,
    max_dim: int | None = None,
    normalize_exposure: bool = False,
) -> np.ndarray | None:
    if max_dim is None:
        max_dim = MAX_IMAGE_DIMENSION
    img = cv2.imread(str(img_path))
    if img is None:
        return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    if normalize_exposure:
        img = _normalize_exposure(img)
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


def fill_black_gaps(
    image: np.ndarray,
    black_thresh: int = 25,
    inpaint_radius: int = 5,
) -> np.ndarray:
    """
    Fill small black gaps (stitching artifacts) using inpainting.
    Only affects pixels darker than black_thresh. Use small radius to avoid blur.
    """
    if inpaint_radius <= 0:
        return image
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = np.uint8((gray < black_thresh) * 255)
    if mask.sum() == 0:
        return image
    return cv2.inpaint(image, mask, inpaint_radius, cv2.INPAINT_TELEA)


def scale_to_max_dim(image: np.ndarray, max_dim: int = WALL_MAX_DIMENSION) -> np.ndarray:
    """Scale down image if it exceeds max_dim on either axis; preserve aspect ratio."""
    h, w = image.shape[:2]
    if max(h, w) <= max_dim:
        return image
    scale = max_dim / max(h, w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)


def enforce_equirectangular(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    target_h = w // 2
    if h != target_h:
        image = cv2.resize(image, (w, target_h), interpolation=cv2.INTER_LINEAR)
    return image


def concatenate_walls(image_paths: list[str]) -> np.ndarray | None:
    """
    Arrange 2–4 wall images horizontally into a panorama (N,E,S,W order).
    Used when feature-based stitching fails (walls don't overlap).
    """
    if len(image_paths) < 2 or len(image_paths) > 4:
        return None
    images = []
    for p in image_paths:
        img = prepare_image(p, max_dim=MAX_IMAGE_DIMENSION)
        if img is None or img.size == 0 or img.shape[0] <= 0 or img.shape[1] <= 0:
            return None
        images.append(np.ascontiguousarray(img.astype(np.uint8)))
    if len(images) < 2:
        return None
    # Resize to common height (use min height to avoid stretching)
    target_h = min(img.shape[0] for img in images)
    resized = []
    for img in images:
        h, w = img.shape[:2]
        scale = target_h / h
        new_w = int(round(w * scale))
        resized.append(
            cv2.resize(img, (new_w, target_h), interpolation=cv2.INTER_LINEAR)
        )
    result = np.hstack(resized)
    result = enforce_equirectangular(result)
    return result


def create_stitcher(
    mode: int | None = None,
    confidence: float | None = None,
    wave_correct: bool = True,
):
    m = mode if mode is not None else STITCH_MODE
    try:
        stitcher = cv2.Stitcher.create(m)
    except AttributeError:
        stitcher = cv2.Stitcher_create(m)
    conf = confidence if confidence is not None else PANO_CONFIDENCE
    try:
        stitcher.setPanoConfidenceThresh(conf)
    except AttributeError:
        pass
    try:
        stitcher.setWaveCorrection(wave_correct)
    except AttributeError:
        pass
    return stitcher


def stitch_panorama(image_paths: list[str], *, single_wall: bool = False) -> np.ndarray:
    """
    Stitch clicked images into panorama.
    Needs at least 2 images.
    - single_wall=False: full 360° output (crop black borders, enforce 2:1 equirectangular).
    - single_wall=True: flat wall output — crop to content, fill black gaps, keep natural proportions.
      Uses affine/SCANS mode first (better for flat walls), wave correction.
    Retries with smaller images, different modes, and reversed order if needed.
    """
    if len(image_paths) < 2:
        raise ValueError("Need at least 2 images to stitch")

    # For 2–4 walls (N,E,S,W): use simple concatenation — feature stitcher fails (no overlap)
    if not single_wall and 2 <= len(image_paths) <= 4:
        concat = concatenate_walls(image_paths)
        if concat is not None:
            return concat

    scans_mode = getattr(cv2, "Stitcher_SCANS", 1)

    def _try_stitch(
        paths: list[str],
        max_dim: int,
        mode: int | None = None,
        confidence: float | None = None,
        normalize_exposure: bool = False,
    ) -> tuple[int, np.ndarray | None]:
        images = []
        for p in paths:
            img = prepare_image(p, max_dim=max_dim, normalize_exposure=normalize_exposure)
            if img is not None and img.size > 0 and img.shape[0] > 0 and img.shape[1] > 0:
                # Ensure contiguous uint8 BGR (avoids OpenCV UMat/setSize issues)
                if not img.flags["C_CONTIGUOUS"] or img.dtype != np.uint8:
                    img = np.ascontiguousarray(img.astype(np.uint8))
                images.append(img)
        if len(images) < 2:
            return -1, None
        conf = confidence if confidence is not None else PANO_CONFIDENCE
        stitcher = create_stitcher(mode=mode, confidence=conf, wave_correct=True)
        try:
            status, result = stitcher.stitch(images)
        except cv2.error:
            return -1, None  # OpenCV internal error (e.g. setSize), retry with other settings
        return status, result if status == cv2.Stitcher_OK else None

    # For walls: fewer images typically, use higher res; enable exposure normalization
    if single_wall:
        max_dim = MAX_IMAGE_DIMENSION  # walls usually 2–8 images
        conf = PANO_CONFIDENCE_WALL
        norm_exp = True
    else:
        max_dim = (
            MAX_IMAGE_DIMENSION_MANY_IMAGES
            if len(image_paths) > MAX_IMAGES_FOR_FAST_MODE
            else MAX_IMAGE_DIMENSION
        )
        conf = PANO_CONFIDENCE
        norm_exp = False

    # Strategy for walls: try SCANS first (affine, better for flat walls), then PANORAMA
    if single_wall:
        # SCANS mode: affine transforms, better for planar wall surfaces
        status, result = _try_stitch(
            image_paths, max_dim, mode=scans_mode, confidence=conf, normalize_exposure=False
        )
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                image_paths, max_dim, mode=STITCH_MODE, confidence=conf, normalize_exposure=False
            )
        # Try reversed order (pan direction can matter)
        if status != cv2.Stitcher_OK:
            rev = list(reversed(image_paths))
            status, result = _try_stitch(
                rev, max_dim, mode=scans_mode, confidence=conf, normalize_exposure=False
            )
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                rev, max_dim, mode=STITCH_MODE, confidence=conf, normalize_exposure=False
            )
        # Last resort: with exposure normalization (can help color drift, but may crash on some)
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                image_paths, max_dim, mode=STITCH_MODE, confidence=conf, normalize_exposure=True
            )
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                image_paths, max_dim, mode=scans_mode, confidence=conf, normalize_exposure=True
            )
    else:
        status, result = _try_stitch(image_paths, max_dim, mode=STITCH_MODE, confidence=conf)

    # Cascade retry: smaller images (no exposure norm to avoid setSize crash)
    if status == cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL:
        for fallback_dim in [1200, 800, 600, 500]:
            if max_dim > fallback_dim:
                status, result = _try_stitch(
                    image_paths,
                    fallback_dim,
                    mode=scans_mode if single_wall else STITCH_MODE,
                    confidence=conf,
                    normalize_exposure=False,
                )
                if status == cv2.Stitcher_OK:
                    break
        if status == cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL and not single_wall:
            for dim in [800, 600, 500]:
                status, result = _try_stitch(
                    image_paths, dim, mode=scans_mode, confidence=conf, normalize_exposure=False
                )
                if status == cv2.Stitcher_OK:
                    break

    status_map = {
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "Need more images",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "Homography estimation failed",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "Camera parameter adjustment failed",
    }
    if status != cv2.Stitcher_OK or result is None:
        raise ValueError(status_map.get(status, f"Stitching failed (code {status})"))

    result = crop_to_content(result)
    if single_wall:
        # Keep natural proportions; fill small black gaps; scale down if too large
        if WALL_INPAINT_RADIUS > 0:
            result = fill_black_gaps(result, black_thresh=25, inpaint_radius=WALL_INPAINT_RADIUS)
        result = scale_to_max_dim(result)
    else:
        result = enforce_equirectangular(result)
    return result

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
PANO_CONFIDENCE_WALL = 0.55  # Slightly stricter for flat walls to reduce bad matches

# Wall output: flat image with this aspect ratio (width:height). E.g. (4, 3) = 4:3.
WALL_ASPECT_RATIO = (4, 3)
WALL_MAX_DIMENSION = 2000  # Max width or height of output


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


def enforce_aspect_ratio(
    image: np.ndarray,
    target_w: int,
    target_h: int,
    max_dim: int = WALL_MAX_DIMENSION,
    pad_color: tuple[int, int, int] = (0, 0, 0),
) -> np.ndarray:
    """
    Resize image to fit within target aspect ratio (target_w:target_h), then pad to exact ratio.
    Scales so no content is cropped; pads with pad_color to reach exact dimensions.
    """
    h, w = image.shape[:2]
    if w <= 0 or h <= 0:
        return image
    target_ratio = target_w / target_h
    current_ratio = w / h
    if current_ratio >= target_ratio:
        # Image is wider or equal; fit to width, pad top/bottom
        out_w = min(w, max_dim)
        out_h = int(round(out_w / target_ratio))
        scale = out_w / w
        scaled_h = int(round(h * scale))
        img_scaled = cv2.resize(image, (out_w, scaled_h), interpolation=cv2.INTER_LINEAR)
        pad_top = (out_h - scaled_h) // 2
        pad_bot = out_h - scaled_h - pad_top
        return cv2.copyMakeBorder(
            img_scaled, pad_top, pad_bot, 0, 0, cv2.BORDER_CONSTANT, value=pad_color
        )
    else:
        # Image is taller; fit to height, pad left/right
        out_h = min(h, max_dim)
        out_w = int(round(out_h * target_ratio))
        scale = out_h / h
        scaled_w = int(round(w * scale))
        img_scaled = cv2.resize(image, (scaled_w, out_h), interpolation=cv2.INTER_LINEAR)
        pad_left = (out_w - scaled_w) // 2
        pad_right = out_w - scaled_w - pad_left
        return cv2.copyMakeBorder(
            img_scaled, 0, 0, pad_left, pad_right, cv2.BORDER_CONSTANT, value=pad_color
        )


def enforce_equirectangular(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    target_h = w // 2
    if h != target_h:
        image = cv2.resize(image, (w, target_h), interpolation=cv2.INTER_LINEAR)
    return image


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
    - single_wall=True: flat wall output — crop black borders, enforce WALL_ASPECT_RATIO (default 4:3).
      Uses affine/SCANS mode first (better for flat walls), wave correction.
    Retries with smaller images, different modes, and reversed order if needed.
    """
    if len(image_paths) < 2:
        raise ValueError("Need at least 2 images to stitch")

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

    # Strategy for walls: try PANORAMA first (most stable), then SCANS; avoid exposure norm
    # initially (CLAHE can trigger OpenCV setSize errors on some inputs)
    if single_wall:
        # Try without exposure norm first — avoids OpenCV 4.10 setSize crash
        status, result = _try_stitch(
            image_paths, max_dim, mode=STITCH_MODE, confidence=conf, normalize_exposure=False
        )
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                image_paths, max_dim, mode=scans_mode, confidence=conf, normalize_exposure=False
            )
        # Try reversed order (pan direction can matter)
        if status != cv2.Stitcher_OK:
            rev = list(reversed(image_paths))
            status, result = _try_stitch(
                rev, max_dim, mode=STITCH_MODE, confidence=conf, normalize_exposure=False
            )
        if status != cv2.Stitcher_OK:
            status, result = _try_stitch(
                rev, max_dim, mode=scans_mode, confidence=conf, normalize_exposure=False
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
        tw, th = WALL_ASPECT_RATIO
        result = enforce_aspect_ratio(result, tw, th)
    else:
        result = enforce_equirectangular(result)
    return result

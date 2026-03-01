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
MAX_IMAGE_DIMENSION_MANY_IMAGES = 1600
MAX_IMAGES_FOR_FAST_MODE = 15
STITCH_MODE = cv2.Stitcher_PANORAMA
PANO_CONFIDENCE = 0.68


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


def crop_black_borders(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    x, y, w, h = cv2.boundingRect(thresh)
    return image[y : y + h, x : x + w]


def enforce_equirectangular(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    target_h = w // 2
    if h != target_h:
        image = cv2.resize(image, (w, target_h), interpolation=cv2.INTER_LINEAR)
    return image


def create_stitcher():
    try:
        stitcher = cv2.Stitcher.create(STITCH_MODE)
    except AttributeError:
        stitcher = cv2.Stitcher_create(STITCH_MODE)
    try:
        stitcher.setPanoConfidenceThresh(PANO_CONFIDENCE)
    except AttributeError:
        pass
    return stitcher


def stitch_panorama(image_paths: list[str]) -> np.ndarray:
    """
    Stitch clicked images into balanced 360° panorama (same as reference script).
    Needs at least 2 images. Returns BGR image (crop black borders, 2:1 equirectangular).
    """
    if len(image_paths) < 2:
        raise ValueError("Need at least 2 images to stitch")
    max_dim = (
        MAX_IMAGE_DIMENSION_MANY_IMAGES
        if len(image_paths) > MAX_IMAGES_FOR_FAST_MODE
        else MAX_IMAGE_DIMENSION
    )
    images = []
    for p in image_paths:
        img = prepare_image(p, max_dim=max_dim)
        if img is not None:
            images.append(img)
    if len(images) < 2:
        raise ValueError("Valid images less than 2 after loading")
    stitcher = create_stitcher()
    status, result = stitcher.stitch(images)
    status_map = {
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "Need more images",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "Homography estimation failed",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "Camera parameter adjustment failed",
    }
    if status != cv2.Stitcher_OK:
        raise ValueError(status_map.get(status, f"Stitching failed (code {status})"))
    result = crop_black_borders(result)
    result = enforce_equirectangular(result)
    return result

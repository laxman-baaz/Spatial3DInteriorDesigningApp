"""
Equirectangular panorama stitching from known poses (pitch, yaw) + FOV.
Uses OpenCV for image I/O and numpy for vectorized projection. No feature matching.
"""
import numpy as np
import cv2

DEG2RAD = np.pi / 180
FOV_H_DEG = 60.0
FOV_V_DEG = 45.0


def uv_to_direction(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Equirectangular (u,v) in [0,1] -> unit directions (x, y, z). All arrays same shape."""
    lon = (u * 360 - 180) * DEG2RAD
    lat = (90 - v * 180) * DEG2RAD
    cos_lat = np.cos(lat)
    x = np.cos(lon) * cos_lat
    y = np.sin(lat)
    z = np.sin(lon) * cos_lat
    return (x, y, z)


def direction_to_rectilinear(
    dx: np.ndarray, dy: np.ndarray, dz: np.ndarray,
    pitch_deg: float, yaw_deg: float,
    fov_h_deg: float, fov_v_deg: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """World directions -> camera rectilinear (x, y) in [-1,1]; mask in_frame."""
    p = pitch_deg * DEG2RAD
    yaw_rad = yaw_deg * DEG2RAD
    cp, sp = np.cos(p), np.sin(p)
    cy, sy = np.cos(yaw_rad), np.sin(yaw_rad)
    rx = dx * cy + dz * sy
    ry = dx * (-sy * sp) + dy * cp + dz * (cy * sp)
    rz = dx * (-sy * cp) - dy * sp + dz * (cy * cp)
    in_front = rz < 0
    scale = np.where(in_front, 1.0 / (-rz), 0.0)
    half_h = (fov_h_deg / 2) * DEG2RAD
    half_v = (fov_v_deg / 2) * DEG2RAD
    x = (rx * scale) / np.tan(half_h)
    y = (ry * scale) / np.tan(half_v)
    in_frame = in_front & (np.abs(x) <= 1) & (np.abs(y) <= 1)
    return (x, y, in_frame)


def sample_rectilinear_grid(
    img: np.ndarray, x_norm: np.ndarray, y_norm: np.ndarray
) -> np.ndarray:
    """Sample image at normalized coords (x_norm, y_norm) in [-1,1]. Returns (H,W,3)."""
    h, w = img.shape[:2]
    px = (x_norm + 1) * 0.5 * (w - 1)
    py = (1 - y_norm) * 0.5 * (h - 1)
    px = np.clip(px, 0, w - 1).astype(np.float32)
    py = np.clip(py, 0, h - 1).astype(np.float32)
    # OpenCV remap: map_x, map_y same size as output
    map_x = px.astype(np.float32)
    map_y = py.astype(np.float32)
    out = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR)
    return out


def stitch_equirectangular(
    image_paths: list[str],
    pitches_deg: list[float],
    yaws_deg: list[float],
    output_width: int = 4096,
    fov_h_deg: float = FOV_H_DEG,
    fov_v_deg: float = FOV_V_DEG,
) -> np.ndarray:
    """
    Stitch images with known poses into one equirectangular panorama (360x180).
    Returns BGR image of shape (output_height, output_width, 3).
    """
    out_w = output_width
    out_h = output_width // 2

    u = (np.arange(out_w, dtype=np.float64) + 0.5) / out_w
    v = (np.arange(out_h, dtype=np.float64) + 0.5) / out_h
    uu, vv = np.meshgrid(u, v)

    dx, dy, dz = uv_to_direction(uu, vv)

    out_acc = np.zeros((out_h, out_w, 3), dtype=np.float64)
    out_weight = np.zeros((out_h, out_w), dtype=np.float64)

    for path, pitch_deg, yaw_deg in zip(image_paths, pitches_deg, yaws_deg):
        im = cv2.imread(path)
        if im is None:
            raise FileNotFoundError(f"Cannot read image: {path}")

        x_norm, y_norm, in_frame = direction_to_rectilinear(
            dx, dy, dz, pitch_deg, yaw_deg, fov_h_deg, fov_v_deg
        )
        sampled = sample_rectilinear_grid(im, x_norm, y_norm)
        dist = np.maximum(np.abs(x_norm), np.abs(y_norm))
        w = np.maximum(0.0, 1.0 - dist)
        w = w * in_frame.astype(np.float64)
        out_acc += sampled.astype(np.float64) * w[:, :, np.newaxis]
        out_weight += w

    out_weight = np.maximum(out_weight, 1e-6)
    out_img = (out_acc / out_weight[:, :, np.newaxis]).astype(np.uint8)
    return out_img


def stitch_and_save(
    image_paths: list[str],
    pitches_deg: list[float],
    yaws_deg: list[float],
    output_path: str,
    output_width: int = 4096,
) -> str:
    """Stitch and write panorama to output_path. Returns output_path."""
    out = stitch_equirectangular(
        image_paths, pitches_deg, yaws_deg, output_width=output_width
    )
    cv2.imwrite(output_path, out)
    return output_path

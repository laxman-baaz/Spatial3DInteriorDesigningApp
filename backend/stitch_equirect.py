"""
Equirectangular panorama stitching from known poses (pitch, yaw) + FOV.
Uses OpenCV for image I/O and numpy for vectorized projection. No feature matching.

Coordinate alignment with app (sphereConfig.TARGET_DOTS + projection.ts):
- App pitch: 0 = nadir (down), 90 = horizon, 180 = zenith (up). Sent in degrees.
- App yaw: 0..360, same order as equirect u: yaw 0 -> u=0 (lon=-180).
- When user aligns a dot and captures, we send that dot's (pitch, yaw) as the pose.
- FOV: 60° H, 45° V (must match PhotosphereScreen FOV_H / FOV_V).
"""
import numpy as np
import cv2

DEG2RAD = np.pi / 180
FOV_H_DEG = 60.0
FOV_V_DEG = 45.0


def uv_to_direction(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Equirectangular (u,v) in [0,1] -> unit directions (x, y, z). All arrays same shape.
    u=0 -> lon=-180 (left), u=0.5 -> lon=0, u=1 -> lon=180. v=0 -> lat=90 (north), v=0.5 -> equator, v=1 -> south."""
    lon = (u * 360 - 180) * DEG2RAD
    lat = (90 - v * 180) * DEG2RAD
    cos_lat = np.cos(lat)
    x = np.cos(lon) * cos_lat
    y = np.sin(lat)
    z = np.sin(lon) * cos_lat
    return (x, y, z)


def _camera_look_direction(pitch_deg: float, yaw_deg: float) -> tuple[float, float, float]:
    """App convention: pitch 0=nadir, 90=horizon, 180=zenith; yaw 0..360.
    Returns unit world vector (lx, ly, lz) the camera is looking at.
    Must match uv_to_direction: lat=90 = north (v=0), lat=-90 = south (v=1)."""
    lon_rad = (yaw_deg - 180.0) * DEG2RAD  # yaw 0 -> lon -180 (match u=0)
    lat_rad = (pitch_deg - 90.0) * DEG2RAD  # pitch 0 (nadir) -> lat -90 (south); 180 (zenith) -> lat 90 (north)
    cl = np.cos(lat_rad)
    lx = np.cos(lon_rad) * cl
    ly = np.sin(lat_rad)
    lz = np.sin(lon_rad) * cl
    return (float(lx), float(ly), float(lz))


def direction_to_rectilinear(
    dx: np.ndarray, dy: np.ndarray, dz: np.ndarray,
    pitch_deg: float, yaw_deg: float,
    fov_h_deg: float, fov_v_deg: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """World directions (dx,dy,dz) -> camera rectilinear (x, y) in [-1,1]; mask in_frame.
    Uses camera look direction from app pitch/yaw so east/north/etc. map correctly."""
    lx, ly, lz = _camera_look_direction(pitch_deg, yaw_deg)
    # Camera basis: forward = L, right = up_world × L, up = L × right (Y-up world)
    rx, ry, rz = lz, 0.0, -lx
    rnorm = np.sqrt(rx * rx + rz * rz)
    if rnorm < 1e-9:
        rnorm = 1e-9
    rx, rz = rx / rnorm, rz / rnorm
    ux = ly * rz - lz * 0
    uy = lz * rx - lx * rz
    uz = lx * 0 - ly * rx
    unorm = np.sqrt(ux * ux + uy * uy + uz * uz)
    if unorm < 1e-9:
        unorm = 1e-9
    ux, uy, uz = ux / unorm, uy / unorm, uz / unorm
    # Depth = dot(L, d); in front when depth > 0
    depth = lx * dx + ly * dy + lz * dz
    in_front = depth > 1e-6
    depth = np.where(in_front, np.maximum(depth, 1e-6), 1.0)
    # Project to image plane and normalize by FOV
    cam_x = (rx * dx + ry * dy + rz * dz) / depth
    cam_y = (ux * dx + uy * dy + uz * dz) / depth
    tan_h = np.tan((fov_h_deg / 2) * DEG2RAD)
    tan_v = np.tan((fov_v_deg / 2) * DEG2RAD)
    x = cam_x / tan_h
    y = cam_y / tan_v
    in_frame = in_front & (np.abs(x) <= 1.0) & (np.abs(y) <= 1.0)
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


def _pose_to_uv_bounds(pitch_deg: float, yaw_deg: float, fov_h_deg: float, fov_v_deg: float) -> tuple[float, float, float, float]:
    """(u_min, u_max, v_min, v_max) for this pose; u/v may be outside [0,1]."""
    u_center = (yaw_deg % 360) / 360.0
    v_center = (180.0 - pitch_deg) / 180.0
    half_u = (fov_h_deg / 2) / 360.0
    half_v = (fov_v_deg / 2) / 180.0
    return (u_center - half_u, u_center + half_u, v_center - half_v, v_center + half_v)


def _compute_partial_extent(
    pitches_deg: list[float], yaws_deg: list[float],
    fov_h_deg: float, fov_v_deg: float, padding: float = 0.02,
) -> tuple[float, float, float, float]:
    """(u_min, u_max, v_min, v_max) covering all poses; full 360 if span wraps or >= 0.96."""
    u_mins, u_maxs, v_mins, v_maxs = [], [], [], []
    for p, y in zip(pitches_deg, yaws_deg):
        umi, uma, vmi, vma = _pose_to_uv_bounds(p, y, fov_h_deg, fov_v_deg)
        u_mins.append(umi)
        u_maxs.append(uma)
        v_mins.append(max(0.0, vmi))
        v_maxs.append(min(1.0, vma))
    u_min_raw, u_max_raw = min(u_mins), max(u_maxs)
    v_min = max(0.0, min(v_mins) - padding)
    v_max = min(1.0, max(v_maxs) + padding)
    spans_seam = u_min_raw < 0 or u_max_raw > 1
    u_min_clamped = max(0.0, u_min_raw - padding)
    u_max_clamped = min(1.0, u_max_raw + padding)
    if spans_seam or (u_max_clamped - u_min_clamped) >= 0.96:
        u_min, u_max = 0.0, 1.0
    else:
        u_min, u_max = u_min_clamped, u_max_clamped
    return u_min, u_max, v_min, v_max


def stitch_equirectangular(
    image_paths: list[str],
    pitches_deg: list[float],
    yaws_deg: list[float],
    output_width: int = 4096,
    fov_h_deg: float = FOV_H_DEG,
    fov_v_deg: float = FOV_V_DEG,
    force_full_360: bool = False,
) -> np.ndarray:
    """
    Stitch images with known poses into one equirectangular panorama.
    Partial coverage (e.g. east + north only) produces a filled partial panorama; each path used once.
    If force_full_360=True (e.g. for WorldLabs 3D), output is always 360×180 (2:1); uncaptured areas are black.
    Returns BGR image of shape (output_height, output_width, 3).
    """
    seen = set()
    paths, pitches, yaws = [], [], []
    for path, p, y in zip(image_paths, pitches_deg, yaws_deg):
        key = path.replace("\\", "/").rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        paths.append(path)
        pitches.append(p)
        yaws.append(y)
    if not paths:
        raise ValueError("No images after deduplication")

    if force_full_360:
        u_min, u_max, v_min, v_max = 0.0, 1.0, 0.0, 1.0
        out_w = min(output_width, 8192)
        out_h = out_w // 2
    else:
        u_min, u_max, v_min, v_max = _compute_partial_extent(pitches, yaws, fov_h_deg, fov_v_deg)
        span_u = u_max - u_min
        span_v = v_max - v_min
        out_w = max(256, int(round(output_width * span_u)))
        out_h = max(128, int(round((output_width // 2) * span_v)))
        MAX_DIM = 8192
        if out_w > MAX_DIM or out_h > MAX_DIM:
            s = MAX_DIM / max(out_w, out_h)
            out_w = max(256, int(out_w * s))
            out_h = max(128, int(out_h * s))

    span_u = u_max - u_min
    span_v = v_max - v_min

    u = (np.arange(out_w, dtype=np.float64) + 0.5) / out_w * span_u + u_min
    v = (np.arange(out_h, dtype=np.float64) + 0.5) / out_h * span_v + v_min
    uu, vv = np.meshgrid(u, v)
    dx, dy, dz = uv_to_direction(uu, vv)

    out_acc = np.zeros((out_h, out_w, 3), dtype=np.float64)
    out_weight = np.zeros((out_h, out_w), dtype=np.float64)

    for path, pitch_deg, yaw_deg in zip(paths, pitches, yaws):
        im = cv2.imread(path)
        if im is None:
            raise FileNotFoundError(f"Cannot read image: {path}")
        x_norm, y_norm, in_frame = direction_to_rectilinear(
            dx, dy, dz, pitch_deg, yaw_deg, fov_h_deg, fov_v_deg
        )
        sampled = sample_rectilinear_grid(im, x_norm, y_norm)
        dist = np.maximum(np.abs(x_norm), np.abs(y_norm))
        w = np.maximum(0.0, 1.0 - dist) * in_frame.astype(np.float64)
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

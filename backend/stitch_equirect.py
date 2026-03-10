"""
Equirectangular panorama stitching from known poses (pitch, yaw) + FOV.
Uses OpenCV for image I/O and numpy for vectorized projection. No feature matching.

Coordinate alignment with app (sphereConfig.TARGET_DOTS + projection.ts):
- App pitch: 0 = nadir (down), 90 = horizon, 180 = zenith (up). Sent in degrees.
- App yaw: 0..360, same order as equirect u: yaw 0 -> u=0 (lon=-180).
- When user aligns a dot and captures, we send that dot's (pitch, yaw) as the pose.
- FOV: MUST match PhotosphereScreen.tsx FOV_H / FOV_V exactly.
  App (PhotosphereScreen.tsx): FOV_H=45, FOV_V=60 — these define how wide each captured image
  is treated in the app's alignment system. The stitcher MUST use the same values so each photo
  is projected onto the correct 45°×60° region of the sphere that the app dot-layout assumes.
  Changing these without changing the app will cause geometric misalignment (boxy, ghost, shifted).
"""
import numpy as np
import cv2

DEG2RAD = np.pi / 180
# CRITICAL: must match PhotosphereScreen.tsx  FOV_H = 45  /  FOV_V = 60
FOV_H_DEG = 45.0
FOV_V_DEG = 60.0


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
    pitch_deg: float, yaw_deg: float, roll_deg: float,
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

    # Apply Roll Rotation around the Look axis (L)
    # Rotating Right and Up vectors around L by roll_deg
    roll_rad = roll_deg * DEG2RAD
    cr = np.cos(roll_rad)
    sr = np.sin(roll_rad)
    
    # New Right = Right * cos(roll) + Up * sin(roll)
    rx_new = rx * cr + ux * sr
    ry_new = ry * cr + uy * sr
    rz_new = rz * cr + uz * sr
    
    # New Up = Up * cos(roll) - Right * sin(roll)
    ux_new = ux * cr - rx * sr
    uy_new = uy * cr - ry * sr
    uz_new = uz * cr - rz * sr

    # Re-assign rotated basis
    rx, ry, rz = rx_new, ry_new, rz_new
    ux, uy, uz = ux_new, uy_new, uz_new

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
    out = cv2.remap(img, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    return out


def _default_input_camera_matrix(width: int, height: int) -> np.ndarray:
    """Camera matrix for a single input image; used for input undistortion.
    Focal length derived from the actual camera FOV (wider than the app's 45° alignment FOV).
    Phone main cameras in portrait are ~65-72° H; we use 68° as a safe middle ground."""
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    # Use real camera FOV (~68°H) for undistortion, not the app's alignment FOV (45°)
    real_fov_h = 68.0
    fx = fy = (min(width, height) * 0.5) / np.tan(real_fov_h * 0.5 * DEG2RAD)
    return np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], dtype=np.float64)


# We project only the central 45° of the real ~68° image — that central zone has much less
# distortion than the full edges, so lighter undistort coefficients are correct here.
# k1=0.20 removes visible barrel from the center without over-warping.
DEFAULT_INPUT_FISHEYE_D = np.array([0.20, 0.05, -0.01, 0.0], dtype=np.float64)
DEFAULT_INPUT_CLASSIC_D = np.array([[0.18], [0.03], [0.0], [0.0], [0.0]], dtype=np.float64)


def _undistort_input_image(
    im: np.ndarray,
    use_fisheye: bool = True,
    camera_matrix: np.ndarray | None = None,
    dist_coeffs: np.ndarray | None = None,
) -> np.ndarray:
    """
    Undistort a single input (e.g. phone) image to remove barrel/lens distortion
    before it is projected onto the panorama. Use same K/D for all inputs from same device.
    """
    h, w = im.shape[:2]
    K = camera_matrix if camera_matrix is not None else _default_input_camera_matrix(w, h)
    K = np.asarray(K, dtype=np.float64)
    if K.shape != (3, 3):
        K = _default_input_camera_matrix(w, h)

    if use_fisheye:
        D = dist_coeffs if dist_coeffs is not None else DEFAULT_INPUT_FISHEYE_D
        D = np.asarray(D, dtype=np.float64).flatten()
        if D.size < 4:
            D = np.resize(D, 4)
        return cv2.fisheye.undistortImage(im, K, D, None, K)
    else:
        D = dist_coeffs if dist_coeffs is not None else DEFAULT_INPUT_CLASSIC_D
        D = np.asarray(D, dtype=np.float64)
        if D.ndim == 1:
            D = D.reshape(-1, 1)
        new_K, _ = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 1.0, (w, h))
        return cv2.undistort(im, K, D, None, new_K)


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
    rolls_deg: list[float],
    output_width: int = 4096,
    fov_h_deg: float = FOV_H_DEG,
    fov_v_deg: float = FOV_V_DEG,
    force_full_360: bool = False,
    undistort_inputs: bool = True,
    input_camera_matrix: np.ndarray | None = None,
    input_dist_coeffs: np.ndarray | None = None,
    input_use_fisheye: bool = True,
    blend_softness: float = 4.0,
    edge_cutoff: float = 0.85,
    winner_takes_all: bool = False,
) -> np.ndarray:
    """
    Stitch images with known poses into one equirectangular panorama.
    Partial coverage (e.g. east + north only) produces a filled partial panorama; each path used once.
    If force_full_360=True (e.g. for WorldLabs 3D), output is always 360×180 (2:1); uncaptured areas are black.
    If undistort_inputs=True (default), each input image is lens-undistorted before projection to reduce barrel/fisheye.
    edge_cutoff: hard ignore pixels beyond this fraction from image center (0.8 = use inner 80% of each frame).
    winner_takes_all: if True, each output pixel comes from only the image where it is most centred — eliminates ghosting.
    blend_softness: only used when winner_takes_all=False; higher = sharper falloff toward image edges.
    Returns BGR image of shape (output_height, output_width, 3).
    """
    seen = set()
    paths, pitches, yaws, rolls = [], [], [], []
    for path, p, y, r in zip(image_paths, pitches_deg, yaws_deg, rolls_deg):
        key = path.replace("\\", "/").rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        paths.append(path)
        pitches.append(p)
        yaws.append(y)
        rolls.append(r)
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
    # winner-takes-all: track best weight and winning color per pixel separately
    out_best_w = np.zeros((out_h, out_w), dtype=np.float64) if winner_takes_all else None
    out_wta_color = np.zeros((out_h, out_w, 3), dtype=np.float64) if winner_takes_all else None

    cutoff = float(np.clip(edge_cutoff, 0.1, 1.0))
    power = max(1.0, float(blend_softness))

    for path, pitch_deg, yaw_deg, roll_deg in zip(paths, pitches, yaws, rolls):
        im = cv2.imread(path)
        if im is None:
            raise FileNotFoundError(f"Cannot read image: {path}")
        if undistort_inputs:
            im = _undistort_input_image(
                im,
                use_fisheye=input_use_fisheye,
                camera_matrix=input_camera_matrix,
                dist_coeffs=input_dist_coeffs,
            )
        x_norm, y_norm, in_frame = direction_to_rectilinear(
            dx, dy, dz, pitch_deg, yaw_deg, roll_deg, fov_h_deg, fov_v_deg
        )
        sampled = sample_rectilinear_grid(im, x_norm, y_norm)

        # Distance from image center; 0 = center, 1 = edge corner
        dist = np.maximum(np.abs(x_norm), np.abs(y_norm))
        # Hard cutoff: ignore anything beyond edge_cutoff from center (reduces overlap zone)
        in_active = in_frame & (dist <= cutoff)
        # Remap dist within [0, cutoff] → [0, 1] so weight=1 at center, 0 at cutoff
        dist_norm = np.where(in_active, dist / cutoff, 1.0)
        base = np.clip(1.0 - dist_norm, 0.0, 1.0)
        w = (base ** power) * in_active.astype(np.float64)

        if winner_takes_all:
            # Each output pixel takes color only from the image whose center it is closest to.
            # No averaging → no ghosting from mis-aligned overlapping views.
            update = w > out_best_w
            out_wta_color[update] = sampled.astype(np.float64)[update]
            out_best_w[update] = w[update]
        else:
            out_acc += sampled.astype(np.float64) * w[:, :, np.newaxis]
            out_weight += w

    if winner_takes_all:
        # Thin seam feathering: near seam boundaries, blend winner with runner-up.
        # For now use winner color directly; pure WTA gives zero ghost.
        out_img = np.clip(out_wta_color, 0, 255).astype(np.uint8)
    else:
        out_weight = np.maximum(out_weight, 1e-6)
        out_img = (out_acc / out_weight[:, :, np.newaxis]).astype(np.uint8)
    return out_img


def _default_camera_matrix(width: int, height: int, scale: float = 1.0) -> np.ndarray:
    """Build a default 3x3 camera matrix for panorama size (center + focal length)."""
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    # Focal length ~ width so horizontal FOV is reasonable for equirect crop
    fx = fy = scale * max(width, height)
    return np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], dtype=np.float64)


def undistort_panorama(
    img: np.ndarray,
    camera_matrix: np.ndarray | None = None,
    dist_coeffs: np.ndarray | None = None,
    use_fisheye: bool = True,
    balance: float = 1.0,
) -> np.ndarray:
    """
    Remove lens distortion from the stitched panorama using OpenCV undistort.

    - use_fisheye=True: cv2.fisheye.undistortImage (4 coeffs: k1, k2, k3, k4).
    - use_fisheye=False: cv2.undistort (classic model: k1, k2, p1, p2, k3).

    If camera_matrix or dist_coeffs are None, defaults are used (mild barrel correction).
    balance (0..1) only for classic model: 0 = crop black, 1 = keep all pixels.
    """
    h, w = img.shape[:2]
    if camera_matrix is None:
        camera_matrix = _default_camera_matrix(w, h)
    K = np.asarray(camera_matrix, dtype=np.float64)
    if K.shape != (3, 3):
        K = _default_camera_matrix(w, h)

    if use_fisheye:
        # Mild post-stitch pass: just clean up any remaining residual curvature after blending.
        # With correct 45/60 FOV, the stitched equirect should already be close to correct.
        if dist_coeffs is None:
            dist_coeffs = np.array([0.10, 0.02, 0.0, 0.0], dtype=np.float64)
        D = np.asarray(dist_coeffs, dtype=np.float64).flatten()
        if D.size < 4:
            D = np.resize(D, 4)
        out = cv2.fisheye.undistortImage(img, K, D, None, K)
    else:
        # Classic k1,k2,p1,p2,k3: stronger default matching phone barrel distortion.
        if dist_coeffs is None:
            dist_coeffs = np.array([[0.28], [0.06], [0.0], [0.0], [-0.02]], dtype=np.float64)
        D = np.asarray(dist_coeffs, dtype=np.float64)
        if D.ndim == 1:
            D = D.reshape(-1, 1)
        new_K, _ = cv2.getOptimalNewCameraMatrix(
            K, D, (w, h), balance, (w, h)
        )
        out = cv2.undistort(img, K, D, None, new_K)
    return out


def stitch_and_save(
    image_paths: list[str],
    pitches_deg: list[float],
    yaws_deg: list[float],
    rolls_deg: list[float] | None = None,
    output_path: str = "pano.jpg",
    output_width: int = 4096,
    undistort: bool = True,
    use_fisheye_undistort: bool = True,
    camera_matrix: np.ndarray | None = None,
    dist_coeffs: np.ndarray | None = None,
    undistort_balance: float = 1.0,
) -> str:
    """Stitch and write panorama to output_path. Returns output_path.
    If undistort=True (default), applies cv2.fisheye.undistortImage or cv2.undistort
    after stitching to reduce barrel/fisheye effect. Pass camera_matrix and dist_coeffs
    for calibrated values, or leave None for defaults."""
    if rolls_deg is None:
        rolls_deg = [0.0] * len(image_paths)
    out = stitch_equirectangular(
        image_paths, pitches_deg, yaws_deg, rolls_deg, output_width=output_width
    )
    if undistort:
        out = undistort_panorama(
            out,
            camera_matrix=camera_matrix,
            dist_coeffs=dist_coeffs,
            use_fisheye=use_fisheye_undistort,
            balance=undistort_balance,
        )
    cv2.imwrite(output_path, out)
    return output_path

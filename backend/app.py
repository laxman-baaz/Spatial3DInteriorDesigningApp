"""
Panorama stitching + AI staging + 3D reconstruction backend.

Endpoints:
  POST /stitch       – stitch photosphere images into equirectangular panorama
  POST /stage        – send panorama to NanoBanana AI for interior staging
  POST /reconstruct – send panorama to WorldLabs Marble for 3D world generation
  GET  /health      – health check

Environment variables (set in backend/.env):
  GOOGLE_API_KEY      – from https://aistudio.google.com/apikey (for image staging)
  NANOBANANA_API_KEY  – from https://nanobananaapi.ai/api-key (alternative)
  IMGBB_API_KEY       – from https://imgbb.com (required only with NANOBANANA)
  WORLDLABS_API_KEY   – from https://platform.worldlabs.ai/api-keys
"""
import json
import os
import tempfile
import uuid
from pathlib import Path

# Load backend/.env automatically if present (python-dotenv)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # dotenv optional – keys can still be set as OS env vars

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from stitch_equirect import (
    stitch_equirectangular,
    undistort_panorama,
    FOV_H_DEG,
    FOV_V_DEG,
)
from nanobanana import stage_panorama as nb_stage_panorama
from worldlabs import reconstruct_world, WorldResult

app = FastAPI(
    title="Panorama Stitcher",
    description="Stitch 27-dot photosphere images into equirectangular panorama using OpenCV",
    version="1.0.0",
)

# Optional: persist stitched panoramas under this dir (e.g. for AsyncStorage / cards)
# Default: backend/output so Walls folder is visible in the project
_DEFAULT_OUTPUT = Path(__file__).parent / "output"
OUTPUT_DIR = Path(os.environ.get("PANORAMA_OUTPUT_DIR", str(_DEFAULT_OUTPUT)))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WALLS_DIR = OUTPUT_DIR / "Walls"
WALLS_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/")
def root():
    return {"service": "panorama-stitcher", "docs": "/docs"}


@app.post("/stitch")
async def stitch(
    images: list[UploadFile] = File(..., description="Images in TARGET_DOTS order (1–32 or more)"),
    poses_json: str = Form(
        ...,
        description='JSON array of {"pitch": deg, "yaw": deg} for each image, same order',
    ),
    output_width: int = Form(4096, description="Equirectangular width (height = width/2)"),
    force_full_360: bool = Form(False, description="If true, output always 360×180 (2:1) for e.g. WorldLabs 3D; uncaptured areas black"),
    mode: str = Form("full", description="'full' for 27-dot photosphere; 'wall' for single-wall 2–5 images; 'compose' for 4 pre-stitched wall panoramas"),
):
    """
    Upload images and their poses; returns stitched equirectangular panorama as JPEG.
    Use 1 to 27+ images; partial coverage is allowed. Poses: pitch 0=nadir, 90=horizon,
    180=zenith; yaw 0..360 (degrees). Set force_full_360=true for 3D export (WorldLabs).
    """
    try:
        poses = json.loads(poses_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid poses_json: {e}")

    received_mode = (mode or "").strip().lower()
    n_imgs = len(images)
    print(f"[/stitch] Received: mode={received_mode!r}, images={n_imgs}")
    if received_mode != "compose" and n_imgs > 4:
        print(
            f"[/stitch] HINT: Room Scan should use mode=compose with 4 wall panoramas, "
            f"not {n_imgs} raw images. Rebuild the app if using Wall Scan flow."
        )

    if len(images) < 1:
        raise HTTPException(status_code=400, detail="At least 1 image required")
    if len(images) != len(poses):
        raise HTTPException(
            status_code=400,
            detail=f"Image count ({len(images)}) must match pose count ({len(poses)})",
        )

    pitches = [float(p["pitch"]) for p in poses]
    yaws = [float(p["yaw"]) for p in poses]
    rolls = [float(p.get("roll", 0.0)) for p in poses]  # Default 0 for backwards compatibility

    is_wall_mode = (mode or "").strip().lower() == "wall"
    is_compose_mode = (mode or "").strip().lower() == "compose"

    tmp_dir = Path(tempfile.mkdtemp())
    paths = []
    try:
        for i, img in enumerate(images):
            ext = Path(img.filename or "").suffix or ".jpg"
            path = tmp_dir / f"img_{i:02d}{ext}"
            content = await img.read()
            path.write_bytes(content)
            paths.append(str(path))

        # Wall mode: use OpenCV feature-based Stitcher (no poses) for single-wall images
        use_wall_stitcher = False
        if is_wall_mode and not force_full_360:
            imgs = [cv2.imread(p) for p in paths]
            if all(im is not None for im in imgs):
                if len(imgs) == 1:
                    out_img = imgs[0]
                    use_wall_stitcher = True
                else:
                    stitcher = cv2.Stitcher.create()  # PANORAMA mode (default)
                    status, pano = stitcher.stitch(imgs)
                    if status == 0:  # cv2.Stitcher.OK
                        out_img = pano
                        use_wall_stitcher = True
                    else:
                        print(f"[stitch] Wall Stitcher failed (status={status}), using pose-based")
                if use_wall_stitcher:
                    h, w = out_img.shape[:2]
                    if w > output_width:
                        scale = output_width / w
                        new_h = int(h * scale)
                        out_img = cv2.resize(out_img, (output_width, new_h), interpolation=cv2.INTER_AREA)

        # Compose mode: 4 pre-stitched wall panoramas arranged at 0°, 90°, 180°, 270°
        # Uses overlapping blend zones at seams for smooth, seamless transitions
        use_compose = False
        if is_compose_mode:
            if len(paths) != 4:
                raise HTTPException(
                    status_code=400,
                    detail="Compose mode requires exactly 4 images (one per wall)",
                )
            imgs = [cv2.imread(p) for p in paths]
            if not all(im is not None for im in imgs):
                raise HTTPException(
                    status_code=400,
                    detail="Failed to load one or more wall panorama images",
                )
            # Sort by yaw so we get 0, 90, 180, 270 order
            sorted_indices = sorted(range(4), key=lambda i: (yaws[i] % 360))
            imgs = [imgs[i] for i in sorted_indices]
            out_h = output_width // 2
            sector_w = output_width // 4
            blend_px = min(256, sector_w // 2)  # Wide overlap for smooth, invisible seams

            def _smooth_ramp(t: np.ndarray) -> np.ndarray:
                """Smoothstep (3t² - 2t³) for soft transitions."""
                t = np.clip(t, 0, 1).astype(np.float32)
                return t * t * (3 - 2 * t)

            out_float = np.zeros((out_h, output_width, 3), dtype=np.float32)
            total_weight = np.zeros((out_h, output_width), dtype=np.float32)

            out_x_arr = np.arange(output_width, dtype=np.float32)

            for i, img in enumerate(imgs):
                h, w = img.shape[:2]
                if h <= 0 or w <= 0:
                    continue
                # Scale to FILL sector (no black bars) – crop overflow
                scale = max(sector_w / w, out_h / h)
                new_w = int(w * scale)
                new_h = int(h * scale)
                resized = cv2.resize(
                    img, (new_w, new_h),
                    interpolation=cv2.INTER_LANCZOS4,
                )
                crop_x = max(0, (new_w - sector_w) // 2)
                crop_y = max(0, (new_h - out_h) // 2)
                crop = resized[
                    crop_y : min(crop_y + out_h, new_h),
                    crop_x : min(crop_x + sector_w, new_w),
                ].astype(np.float32)
                # Ensure exact (out_h, sector_w) for consistent accumulation
                if crop.shape[0] != out_h or crop.shape[1] != sector_w:
                    crop = cv2.resize(crop, (sector_w, out_h), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)

                x0 = i * sector_w
                x1 = (i + 1) * sector_w
                left_bound = x0 - blend_px
                right_bound = x1 + blend_px

                # Weight: smoothstep for soft blending at seams
                # Left overlap [x0-blend_px, x0]: weight 0→1 (blend with sector i-1)
                # Center [x0, x1]: weight 1
                # Right overlap [x1, x1+blend_px]: weight 1→0 (blend with sector i+1)
                wgt = np.zeros(output_width, dtype=np.float32)
                wgt[(out_x_arr >= x0) & (out_x_arr < x1)] = 1.0
                mask_left = (out_x_arr >= left_bound) & (out_x_arr < x0)
                t_left = (out_x_arr[mask_left] - left_bound) / blend_px if blend_px > 0 else np.ones(np.sum(mask_left))
                wgt[mask_left] = _smooth_ramp(t_left)
                mask_right = (out_x_arr >= x1) & (out_x_arr < right_bound)
                t_right = (right_bound - out_x_arr[mask_right]) / blend_px if blend_px > 0 else np.ones(np.sum(mask_right))
                wgt[mask_right] = _smooth_ramp(t_right)

                # Map output x → crop column (with overlap sampling)
                crop_col = np.clip(out_x_arr - x0, 0, sector_w - 1).astype(np.int32)
                # Left overlap: sample from crop's left edge
                crop_col[mask_left] = np.clip(
                    (out_x_arr[mask_left] - left_bound).astype(np.int32), 0, sector_w - 1
                )
                # Right overlap: sample from crop's right edge (cols sector_w-blend_px .. sector_w-1)
                rel_right = out_x_arr[mask_right] - x1
                crop_col[mask_right] = np.clip(
                    (sector_w - blend_px + rel_right).astype(np.int32), 0, sector_w - 1
                )

                # Zero weight outside this sector's contribution zone
                wgt[out_x_arr < left_bound] = 0
                wgt[out_x_arr >= right_bound] = 0

                # Accumulate: crop[:, crop_col, :] → (out_h, output_width, 3)
                contrib = crop[:, crop_col, :] * wgt[np.newaxis, :, np.newaxis]
                out_float += contrib
                total_weight += wgt

            # Normalize (avoid div by zero)
            mask = total_weight > 1e-6
            out_img = np.zeros((out_h, output_width, 3), dtype=np.uint8)
            out_img[mask] = (out_float[mask] / total_weight[mask, np.newaxis]).astype(np.uint8)
            use_compose = True
            print(f"[/stitch] Compose mode: 4 wall panoramas → {output_width}x{out_h} (blend={blend_px}px)")
        if not use_wall_stitcher and not use_compose:
            out_img = stitch_equirectangular(
                paths,
                pitches,
                yaws,
                rolls,
                output_width=output_width,
                fov_h_deg=FOV_H_DEG + 15.0,
                fov_v_deg=FOV_V_DEG,
                force_full_360=force_full_360,
                winner_takes_all=False,
                edge_cutoff=0.85,
                blend_softness=2.0,
                yaw_auto_correct=False if is_wall_mode else True,
                num_columns=9,
            )

        # Post-stitch undistort: skip for wall/compose mode to avoid adding distortion.
        # Full mode: mild pass to clean residual curvature.
        if not is_wall_mode and not use_compose:
            out_img = undistort_panorama(
                out_img,
                camera_matrix=None,
                dist_coeffs=None,
                use_fisheye=True,
                balance=0.8,
            )

        # Encode to JPEG
        _, jpeg_buf = cv2.imencode(".jpg", out_img)
        jpeg_bytes = jpeg_buf.tobytes()

        # Save to OUTPUT_DIR (or WALLS_DIR for wall mode) for persistence
        save_id = str(uuid.uuid4())
        if is_wall_mode:
            save_path = WALLS_DIR / f"wall_{save_id}.jpg"
            print(f"[/stitch] Saved wall panorama → {save_path}")
        else:
            save_path = OUTPUT_DIR / f"panorama_{save_id}.jpg"
        save_path.write_bytes(jpeg_bytes)

        return Response(
            content=jpeg_bytes,
            media_type="image/jpeg",
            headers={
                "X-Panorama-Id": save_id,
                "X-Panorama-Path": str(save_path),
            },
        )
    finally:
        for p in paths:
            try:
                os.unlink(p)
            except OSError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass


@app.post("/stage")
async def stage(
    image: UploadFile = File(..., description="Stitched panorama JPEG to stage"),
    prompt: str = Form(
        ...,
        description="Interior design staging prompt, e.g. 'modern living room with warm lighting'",
    ),
):
    """
    Send a stitched panorama for AI interior staging.

    Supports two backends (use one):
      GOOGLE_API_KEY     – Google AI Studio key (aistudio.google.com/apikey), no imgbb needed
      NANOBANANA_API_KEY – NanoBanana bearer token (nanobananaapi.ai/api-key)
      IMGBB_API_KEY      – Required only with NANOBANANA (imgbb.com)

    Returns the staged panorama as image/jpeg with header X-Staged-Id.
    """
    google_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    nb_key = os.environ.get("NANOBANANA_API_KEY", "")
    imgbb_key = os.environ.get("IMGBB_API_KEY", "")

    if not google_key and not nb_key:
        raise HTTPException(
            status_code=503,
            detail="Set GOOGLE_API_KEY (aistudio.google.com/apikey) or NANOBANANA_API_KEY. Restart server.",
        )
    if not google_key and not imgbb_key:
        raise HTTPException(
            status_code=503,
            detail="IMGBB_API_KEY required when using NANOBANANA_API_KEY. Set it and restart.",
        )

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    print(f"[/stage] prompt={prompt!r}, imageBytes={len(image_bytes)}, backend={'Google' if google_key else 'NanoBanana'}")

    try:
        staged_bytes = nb_stage_panorama(
            image_bytes, prompt, nb_key, imgbb_key, google_key=google_key or None
        )
    except TimeoutError as e:
        print(f"[/stage] TIMEOUT: {e}")
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        import traceback
        print(f"[/stage] ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Staging failed: {type(e).__name__}: {e}")

    # Persist the staged panorama alongside stitched ones
    staged_id = str(uuid.uuid4())
    staged_path = OUTPUT_DIR / f"staged_{staged_id}.jpg"
    staged_path.write_bytes(staged_bytes)
    print(f"[/stage] saved staged panorama → {staged_path}")

    return Response(
        content=staged_bytes,
        media_type="image/jpeg",
        headers={"X-Staged-Id": staged_id, "X-Staged-Path": str(staged_path)},
    )


@app.post("/reconstruct")
async def reconstruct(
    image: UploadFile = File(
        ..., description="Stitched or AI-staged panorama JPEG to convert to 3D"
    ),
    display_name: str = Form("Interior Panorama", description="World display name"),
    text_prompt: str = Form(
        "",
        description="Optional text hint to guide reconstruction, e.g. 'modern living room'",
    ),
    model: str = Form(
        "Marble 0.1-plus",
        description="'Marble 0.1-plus' (best, ~5 min) or 'Marble 0.1-mini' (draft, ~45s)",
    ),
):
    """
    Send a panorama to WorldLabs Marble for 3D world generation.

    Requires WORLDLABS_API_KEY in backend/.env.

    Returns JSON with all WorldLabs asset URLs:
      world_id, marble_url, thumbnail_url, caption, pano_url,
      spz_url_100k, spz_url_500k, spz_url_full, collider_mesh_url (GLB)
    """
    wl_key = os.environ.get("WORLDLABS_API_KEY", "")
    if not wl_key:
        raise HTTPException(
            status_code=503,
            detail="WORLDLABS_API_KEY not configured. Set it in backend/.env and restart.",
        )

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    # Auto-generate a text prompt from the display name if none provided
    effective_prompt = text_prompt.strip() or display_name

    print(
        f"[/reconstruct] display_name={display_name!r}"
        f" model={model!r} imageBytes={len(image_bytes)}"
    )

    try:
        result: WorldResult = reconstruct_world(
            image_bytes   = image_bytes,
            display_name  = display_name,
            text_prompt   = effective_prompt,
            api_key       = wl_key,
            model         = model,
        )
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconstruction failed: {e}")

    return {
        "world_id":          result.world_id,
        "marble_url":        result.marble_url,
        "thumbnail_url":     result.thumbnail_url,
        "caption":           result.caption,
        "pano_url":          result.pano_url,
        "spz_url_100k":      result.spz_url_100k,
        "spz_url_500k":      result.spz_url_500k,
        "spz_url_full":      result.spz_url_full,
        "collider_mesh_url": result.collider_mesh_url,
    }


@app.get("/health")
def health():
    return {"status": "ok"}

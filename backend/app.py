"""
Panorama stitching + AI staging + 3D reconstruction backend.

Endpoints:
  POST /stitch       – stitch wall images (OpenCV) or 4 walls → 360° (NanoBanana AI)
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

from nanobanana import stage_panorama as nb_stage_panorama
from nanobanana import stitch_panorama_google as nb_stitch_panorama
from nanobanana import STITCH_PANORAMA_PROMPT
from worldlabs import reconstruct_world, WorldResult

app = FastAPI(
    title="Panorama Stitcher",
    description="Stitch wall images (OpenCV) or 4 walls → 360° panorama (NanoBanana AI)",
    version="1.0.0",
)

# Optional: persist stitched panoramas under this dir (e.g. for AsyncStorage / cards)
# Default: backend/output so Walls folder is visible in the project
_DEFAULT_OUTPUT = Path(__file__).parent / "output"
OUTPUT_DIR = Path(os.environ.get("PANORAMA_OUTPUT_DIR", str(_DEFAULT_OUTPUT)))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WALLS_DIR = OUTPUT_DIR / "Walls"
WALLS_DIR.mkdir(parents=True, exist_ok=True)


def _parse_aspect(s: str) -> tuple[float, float]:
    """Parse '4:3' or '16:9' -> (w, h). Default (4, 3) on error."""
    s = (s or "4:3").strip()
    try:
        parts = s.split(":")
        if len(parts) == 2:
            w, h = float(parts[0]), float(parts[1])
            if w > 0 and h > 0:
                return (w, h)
    except (ValueError, IndexError):
        pass
    return (4.0, 3.0)


def _wall_output_to_aspect(img: np.ndarray, max_width: int, aspect_str: str) -> np.ndarray:
    """
    Scale and crop wall stitcher output to a flat image with target aspect ratio.
    Uses center crop to avoid cylindrical/panorama elongation.
    """
    h, w = img.shape[:2]
    if w == 0 or h == 0:
        return img
    aw, ah = _parse_aspect(aspect_str)
    target_ratio = aw / ah  # e.g. 4/3

    # Scale to fit max_width, then crop to exact aspect
    if w > max_width:
        scale = max_width / w
        new_w = max_width
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    # Center crop to target aspect
    target_w = int(h * target_ratio)
    target_h = int(w / target_ratio)
    if target_w <= w:
        # Crop width (take center)
        x0 = (w - target_w) // 2
        img = img[:, x0 : x0 + target_w]
    else:
        # Crop height (take center)
        y0 = (h - target_h) // 2
        img = img[y0 : y0 + target_h, :]

    return img


@app.get("/")
def root():
    return {"service": "panorama-stitcher", "docs": "/docs"}


@app.post("/stitch")
async def stitch(
    images: list[UploadFile] = File(..., description="Images to stitch"),
    poses_json: str = Form(
        default="[]",
        description='JSON array of {"pitch": deg, "yaw": deg} for each image (required for wall mode validation)',
    ),
    output_width: int = Form(4096, description="Max width for wall output"),
    mode: str = Form("wall", description="'wall' for single-wall 2–5 images (OpenCV); 'nanobanana' for AI stitching of 4 walls via Gemini"),
    wall_aspect: str = Form("4:3", description="For wall mode: target aspect ratio (e.g. '4:3', '16:9', '3:2') for flat output"),
):
    """
    Stitch images: wall mode (OpenCV, 1–5 images) or nanobanana (4 wall panoramas → 360°).
    """
    try:
        poses = json.loads(poses_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid poses_json: {e}")

    received_mode = (mode or "wall").strip().lower()
    n_imgs = len(images)
    print(f"[/stitch] Received: mode={received_mode!r}, images={n_imgs}")

    if received_mode not in ("wall", "nanobanana"):
        raise HTTPException(
            status_code=400,
            detail=f"mode must be 'wall' or 'nanobanana', got {received_mode!r}",
        )

    if len(images) < 1:
        raise HTTPException(status_code=400, detail="At least 1 image required")

    is_wall_mode = received_mode == "wall"
    is_nanobanana_mode = received_mode == "nanobanana"

    if is_wall_mode and len(images) != len(poses) and len(poses) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Image count ({len(images)}) must match pose count ({len(poses)})",
        )

    # NanoBanana (Gemini) AI stitching: 4 wall images → seamless 360° panorama
    if is_nanobanana_mode:
        if len(images) != 4:
            raise HTTPException(
                status_code=400,
                detail="NanoBanana mode requires exactly 4 images (one per wall)",
            )
        google_key = os.environ.get("GOOGLE_API_KEY", "").strip()
        if not google_key:
            raise HTTPException(
                status_code=503,
                detail="GOOGLE_API_KEY required for NanoBanana stitching. Set it in backend/.env",
            )
        try:
            img_bytes_list = [await img.read() for img in images]
            out_bytes = nb_stitch_panorama(img_bytes_list, STITCH_PANORAMA_PROMPT, google_key)
        except TimeoutError as e:
            raise HTTPException(status_code=504, detail=str(e))
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"NanoBanana stitching failed: {e}")

        save_id = str(uuid.uuid4())
        save_path = OUTPUT_DIR / f"panorama_{save_id}.jpg"
        save_path.write_bytes(out_bytes)
        print(f"[/stitch] NanoBanana stitch saved → {save_path}")
        return Response(
            content=out_bytes,
            media_type="image/jpeg",
            headers={
                "X-Panorama-Id": save_id,
                "X-Panorama-Path": str(save_path),
            },
        )

    # Wall mode: OpenCV Stitcher only
    tmp_dir = Path(tempfile.mkdtemp())
    paths = []
    try:
        for i, img in enumerate(images):
            ext = Path(img.filename or "").suffix or ".jpg"
            path = tmp_dir / f"img_{i:02d}{ext}"
            content = await img.read()
            path.write_bytes(content)
            paths.append(str(path))

        imgs = [cv2.imread(p) for p in paths]
        if not all(im is not None for im in imgs):
            raise HTTPException(status_code=400, detail="Could not read one or more images")

        if len(imgs) == 1:
            out_img = imgs[0]
        else:
            # SCANS mode: affine warping → flat image (no cylindrical/panorama distortion)
            stitcher = cv2.Stitcher.create(cv2.STITCHER_SCANS)
            status, pano = stitcher.stitch(imgs)
            if status == 0:  # cv2.Stitcher.OK
                out_img = pano
            else:
                # Fallback: PANORAMA for perspective-heavy photos
                print(f"[/stitch] Wall SCANS failed (status={status}), trying PANORAMA")
                stitcher = cv2.Stitcher.create(cv2.STITCHER_PANORAMA)
                status, pano = stitcher.stitch(imgs)
                if status == 0:
                    out_img = pano
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"OpenCV stitching failed (status={status}). Ensure overlapping photos with sufficient features.",
                    )

        out_img = _wall_output_to_aspect(out_img, output_width, wall_aspect)

        _, jpeg_buf = cv2.imencode(".jpg", out_img)
        jpeg_bytes = jpeg_buf.tobytes()

        save_id = str(uuid.uuid4())
        save_path = WALLS_DIR / f"wall_{save_id}.jpg"
        save_path.write_bytes(jpeg_bytes)
        print(f"[/stitch] Saved wall panorama → {save_path}")

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

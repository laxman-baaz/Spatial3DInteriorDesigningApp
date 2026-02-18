"""
Panorama stitching + AI staging backend: FastAPI + OpenCV + NanoBanana.

Endpoints:
  POST /stitch  – stitch photosphere images into equirectangular panorama
  POST /stage   – send panorama to NanoBanana AI for interior staging
  GET  /health  – health check

Environment variables for /stage:
  NANOBANANA_API_KEY  – from https://nanobananaapi.ai/api-key
  IMGBB_API_KEY       – from https://imgbb.com  (free account, used for public hosting)
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
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from stitch_equirect import stitch_equirectangular, FOV_H_DEG, FOV_V_DEG
from nanobanana import stage_panorama as nb_stage_panorama

app = FastAPI(
    title="Panorama Stitcher",
    description="Stitch 32-dot photosphere images into equirectangular panorama using OpenCV",
    version="1.0.0",
)

# Optional: persist stitched panoramas under this dir (e.g. for AsyncStorage / cards)
OUTPUT_DIR = Path(os.environ.get("PANORAMA_OUTPUT_DIR", tempfile.gettempdir()))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


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
):
    """
    Upload images and their poses; returns stitched equirectangular panorama as JPEG.
    Use 1 to 32+ images; partial coverage is allowed. Poses: pitch 0=nadir, 90=horizon,
    180=zenith; yaw 0..360 (degrees).
    """
    try:
        poses = json.loads(poses_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid poses_json: {e}")

    if len(images) < 1:
        raise HTTPException(status_code=400, detail="At least 1 image required")
    if len(images) != len(poses):
        raise HTTPException(
            status_code=400,
            detail=f"Image count ({len(images)}) must match pose count ({len(poses)})",
        )

    pitches = [float(p["pitch"]) for p in poses]
    yaws = [float(p["yaw"]) for p in poses]

    tmp_dir = Path(tempfile.mkdtemp())
    paths = []
    try:
        for i, img in enumerate(images):
            ext = Path(img.filename or "").suffix or ".jpg"
            path = tmp_dir / f"img_{i:02d}{ext}"
            content = await img.read()
            path.write_bytes(content)
            paths.append(str(path))

        out_img = stitch_equirectangular(
            paths,
            pitches,
            yaws,
            output_width=output_width,
            fov_h_deg=FOV_H_DEG,
            fov_v_deg=FOV_V_DEG,
        )

        # Encode to JPEG
        _, jpeg_buf = cv2.imencode(".jpg", out_img)
        jpeg_bytes = jpeg_buf.tobytes()

        # Save to OUTPUT_DIR for persistence (e.g. for app cards / AsyncStorage)
        save_id = str(uuid.uuid4())
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
    Send a stitched panorama to NanoBanana for AI interior staging.

    Requires these environment variables to be set on the server:
      NANOBANANA_API_KEY – NanoBanana bearer token
      IMGBB_API_KEY      – imgbb.com API key (used to host the panorama publicly)

    Returns the staged panorama as image/jpeg with header X-Staged-Id.
    """
    nb_key = os.environ.get("NANOBANANA_API_KEY", "")
    imgbb_key = os.environ.get("IMGBB_API_KEY", "")

    if not nb_key:
        raise HTTPException(
            status_code=503,
            detail="NANOBANANA_API_KEY not configured on server. Set the env var and restart.",
        )
    if not imgbb_key:
        raise HTTPException(
            status_code=503,
            detail="IMGBB_API_KEY not configured on server. Set the env var and restart.",
        )

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    print(f"[/stage] prompt={prompt!r}, imageBytes={len(image_bytes)}")

    try:
        staged_bytes = nb_stage_panorama(image_bytes, prompt, nb_key, imgbb_key)
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Staging failed: {e}")

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


@app.get("/health")
def health():
    return {"status": "ok"}

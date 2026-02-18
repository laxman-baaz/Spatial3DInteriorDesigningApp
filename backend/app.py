"""
Panorama stitching backend: FastAPI + OpenCV.
POST /stitch: upload images + poses (pitch, yaw per image), get equirectangular panorama.
"""
import json
import os
import tempfile
import uuid
from pathlib import Path

import cv2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from stitch_equirect import stitch_equirectangular, FOV_H_DEG, FOV_V_DEG

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


@app.get("/health")
def health():
    return {"status": "ok"}

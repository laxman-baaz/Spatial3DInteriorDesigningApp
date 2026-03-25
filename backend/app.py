"""
Panorama stitching + AI staging + 3D reconstruction backend.

Endpoints:
  POST /stitch       – stitch photosphere images into equirectangular panorama (Gemini AI)
  POST /stage        – send panorama to NanoBanana AI for interior staging
  POST /reconstruct – send panorama to WorldLabs Marble for 3D world generation
  GET  /health      – health check (+ database status when DATABASE_URL is set)
  GET  /panoramas   – list panoramas (requires PostgreSQL)
  ...

Environment variables (set in backend/.env):
  GOOGLE_API_KEY      – from aistudio.google.com/apikey (required for /stitch)
  NANOBANANA_API_KEY  – from https://nanobananaapi.ai/api-key
  IMGBB_API_KEY       – from https://imgbb.com
  WORLDLABS_API_KEY   – from https://platform.worldlabs.ai/api-keys
  DATABASE_URL        – postgresql+psycopg2://user:pass@host:5432/dbname
  BACKEND_PUBLIC_URL  – base URL clients use (e.g. http://192.168.1.10:8000) for panorama image links
"""
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

# Load backend/.env automatically if present (python-dotenv)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # dotenv optional – keys can still be set as OS env vars

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import SessionLocal, init_db, db_health_check
from nanobanana import (
    stage_panorama as nb_stage_panorama,
    stitch_photosphere_column_then_full,
    stitch_panorama_google,
    STITCH_360_PANORAMA_PROMPT,
)
from panorama_db import upsert_after_stitch, update_after_stage, update_world3d
from panorama_routes import build_router
from worldlabs import reconstruct_world, WorldResult

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if init_db():
        log.info("PostgreSQL: tables ensured (DATABASE_URL set)")
    yield


app = FastAPI(
    title="Panorama Stitcher",
    description="Stitch photosphere images into 360° equirectangular panorama using Gemini AI",
    version="1.0.0",
    lifespan=lifespan,
)

# Optional: persist stitched panoramas under this dir (e.g. for AsyncStorage / cards)
OUTPUT_DIR = Path(
    os.environ.get("PANORAMA_OUTPUT_DIR", str(Path(__file__).parent / "output"))
)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

_PUBLIC_BASE = os.environ.get("BACKEND_PUBLIC_URL", "http://localhost:8000").strip()
app.include_router(build_router(_PUBLIC_BASE))


def _record_stitch_db(panorama_id: str, stitched_filename: str) -> None:
    if SessionLocal is None:
        return
    db = SessionLocal()
    try:
        upsert_after_stitch(db, panorama_id, stitched_filename)
    except Exception as e:
        log.warning("PostgreSQL upsert after stitch failed (stitch still succeeded): %s", e)
        db.rollback()
    finally:
        db.close()


def _world_result_to_meta(r: WorldResult) -> dict:
    """Same shape as World3DMeta in the React Native app (camelCase)."""
    return {
        "worldId": r.world_id,
        "marbleUrl": r.marble_url,
        "thumbnailUrl": r.thumbnail_url,
        "caption": r.caption,
        "panoUrl": r.pano_url,
        "spzUrl100k": r.spz_url_100k,
        "spzUrl500k": r.spz_url_500k,
        "spzUrlFull": r.spz_url_full,
        "colliderMeshUrl": r.collider_mesh_url,
    }


@app.get("/")
def root():
    return {"service": "panorama-stitcher", "docs": "/docs"}


@app.post("/stitch")
async def stitch(
    images: list[UploadFile] = File(..., description="Images in TARGET_DOTS order (24 for 8×3 layout)"),
    poses_json: str = Form(
        ...,
        description='JSON array of {"pitch": deg, "yaw": deg} for each image, same order',
    ),
    output_width: int = Form(4096, description="Equirectangular width (ignored; Gemini outputs its own size)"),
    force_full_360: bool = Form(False, description="Ignored; Gemini always outputs full panorama"),
):
    """
    Upload images and their poses; returns stitched equirectangular panorama as JPEG.
    Uses Gemini AI for stitching. Images in TARGET_DOTS order. Poses accepted for API compatibility.
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

    google_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not google_key:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_API_KEY not configured. Set it in backend/.env (aistudio.google.com/apikey).",
        )

    image_bytes_list = []
    for img in images:
        content = await img.read()
        if len(content) > 0:
            image_bytes_list.append(content)

    if len(image_bytes_list) < 1:
        raise HTTPException(status_code=400, detail="At least 1 valid image required")

    save_id = str(uuid.uuid4())
    try:
        if len(image_bytes_list) == 24:
            jpeg_bytes = stitch_photosphere_column_then_full(
                image_bytes_list,
                google_key,
                output_dir=OUTPUT_DIR,
                save_id=save_id,
            )
        else:
            jpeg_bytes = stitch_panorama_google(
                image_bytes_list,
                STITCH_360_PANORAMA_PROMPT,
                google_key,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Stitching failed: {e}")

    stitched_name = f"panorama_{save_id}.jpg"
    save_path = OUTPUT_DIR / stitched_name
    save_path.write_bytes(jpeg_bytes)

    _record_stitch_db(save_id, stitched_name)

    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={
            "X-Panorama-Id": save_id,
            "X-Panorama-Path": str(save_path),
        },
    )


@app.post("/stage")
async def stage(
    image: UploadFile = File(..., description="Stitched panorama JPEG to stage"),
    prompt: str = Form(
        ...,
        description="Interior design staging prompt, e.g. 'modern living room with warm lighting'",
    ),
    panorama_id: str | None = Form(
        None,
        description="If set, links staged file to this panorama in PostgreSQL and saves as staged_{id}.jpg",
    ),
):
    """
    Send a stitched panorama for AI interior staging.

    Supports two backends (use one):
      GOOGLE_API_KEY     – Google AI Studio (aistudio.google.com/apikey), no imgbb needed
      NANOBANANA_API_KEY – NanoBanana API (nanobananaapi.ai/api-key) + IMGBB_API_KEY

    Optional panorama_id: when DATABASE_URL is set, updates the panorama row and uses a stable filename.
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

    print(f"[/stage] prompt={prompt!r}, imageBytes={len(image_bytes)}, panorama_id={panorama_id!r}")

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

    if panorama_id and panorama_id.strip():
        pid = panorama_id.strip()
        staged_id = pid
        staged_name = f"staged_{pid}.jpg"
    else:
        staged_id = str(uuid.uuid4())
        staged_name = f"staged_{staged_id}.jpg"

    staged_path = OUTPUT_DIR / staged_name
    staged_path.write_bytes(staged_bytes)
    print(f"[/stage] saved staged panorama → {staged_path}")

    if SessionLocal and panorama_id and panorama_id.strip():
        db = SessionLocal()
        try:
            update_after_stage(db, panorama_id.strip(), staged_name, staging_prompt=prompt)
        except Exception as e:
            log.warning("PostgreSQL update after stage failed: %s", e)
            db.rollback()
        finally:
            db.close()

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
    panorama_id: str | None = Form(
        None,
        description="If set, stores WorldLabs metadata on this panorama in PostgreSQL",
    ),
):
    """
    Send a panorama to WorldLabs Marble for 3D world generation.

    Requires WORLDLABS_API_KEY in backend/.env.

    Returns JSON with all WorldLabs asset URLs.
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

    effective_prompt = text_prompt.strip() or display_name

    print(
        f"[/reconstruct] display_name={display_name!r}"
        f" model={model!r} imageBytes={len(image_bytes)} panorama_id={panorama_id!r}"
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

    out = {
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

    if SessionLocal and panorama_id and panorama_id.strip():
        db = SessionLocal()
        try:
            update_world3d(db, panorama_id.strip(), _world_result_to_meta(result))
        except Exception as e:
            log.warning("PostgreSQL update after reconstruct failed: %s", e)
            db.rollback()
        finally:
            db.close()

    return out


@app.get("/health")
def health():
    body: dict = {"status": "ok"}
    body["database"] = db_health_check()
    return body

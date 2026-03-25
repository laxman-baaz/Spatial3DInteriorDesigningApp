"""REST API for panoramas stored in PostgreSQL."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import SessionLocal, engine, get_db
from db_models import Panorama
from panorama_db import get_one, list_all, patch_metadata, upsert_imported_panorama
from schemas_panorama import PanoramaOut, PanoramaPatch

OUTPUT_DIR = Path(
    os.environ.get("PANORAMA_OUTPUT_DIR", str(Path(__file__).parent / "output"))
)


def _require_db(db: Session | None) -> Session:
    if db is None or SessionLocal is None or engine is None:
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set DATABASE_URL in backend/.env and restart.",
        )
    return db


def _row_to_out(row: Panorama, base_url: str) -> PanoramaOut:
    base = base_url.rstrip("/")
    image_url = f"{base}/panoramas/{row.id}/image"
    staged_url = f"{base}/panoramas/{row.id}/staged" if row.staged_filename else None
    return PanoramaOut(
        id=row.id,
        title=row.title,
        date_display=row.date_display,
        stitched_filename=row.stitched_filename,
        staged_filename=row.staged_filename,
        staging_prompt_last=row.staging_prompt_last,
        world3d=row.world3d,
        created_at=row.created_at,
        updated_at=row.updated_at,
        device_id=row.device_id,
        image_url=image_url,
        staged_image_url=staged_url,
    )


_SAFE_PANORAMA_ID = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")


def build_router(public_base_url: str) -> APIRouter:
    router = APIRouter(prefix="/panoramas", tags=["panoramas"])

    @router.post("/import", response_model=PanoramaOut)
    async def import_panorama(
        panorama_id: str = Form(..., description="Same id as on the device (e.g. stitch X-Panorama-Id)"),
        title: str = Form(...),
        date_display: str | None = Form(None),
        world3d_json: str | None = Form(None, description="JSON string; same shape as app World3DMeta (camelCase)"),
        image: UploadFile = File(..., description="Stitched panorama JPEG"),
        staged_image: UploadFile | None = File(None, description="Optional AI-staged JPEG"),
        db: Session = Depends(get_db),
    ):
        """
        Upload local panorama file(s) from the phone and upsert a database row.
        Saves under output/ as panorama_{id}.jpg and optionally staged_{id}.jpg.
        """
        pid = panorama_id.strip()
        if not _SAFE_PANORAMA_ID.match(pid):
            raise HTTPException(
                status_code=400,
                detail="Invalid panorama_id (use letters, numbers, dot, underscore, hyphen; max 64 chars)",
            )

        s = _require_db(db)
        existing = get_one(s, pid)

        img_bytes = await image.read()
        if not img_bytes:
            raise HTTPException(status_code=400, detail="Stitched image is empty")

        stitched_name = f"panorama_{pid}.jpg"
        path_stitched = OUTPUT_DIR / stitched_name
        path_stitched.write_bytes(img_bytes)

        staged_fn: str | None = None
        if staged_image is not None:
            sb = await staged_image.read()
            if len(sb) > 0:
                staged_fn = f"staged_{pid}.jpg"
                (OUTPUT_DIR / staged_fn).write_bytes(sb)
            elif existing and existing.staged_filename:
                staged_fn = existing.staged_filename
        elif existing and existing.staged_filename:
            staged_fn = existing.staged_filename

        world3d: dict | None = None
        patch_world3d = False
        if world3d_json and world3d_json.strip():
            try:
                parsed = json.loads(world3d_json)
                if not isinstance(parsed, dict):
                    raise ValueError("not an object")
                world3d = parsed
                patch_world3d = True
            except (json.JSONDecodeError, ValueError) as e:
                raise HTTPException(status_code=400, detail=f"Invalid world3d_json: {e}") from e

        row = upsert_imported_panorama(
            s,
            pid,
            stitched_name,
            title=title.strip() or f"Panorama {pid[:8]}",
            date_display=date_display.strip() if date_display else None,
            staged_filename=staged_fn,
            world3d=world3d,
            patch_world3d=patch_world3d,
        )
        return _row_to_out(row, public_base_url)

    @router.get("", response_model=list[PanoramaOut])
    def list_panoramas(db: Session = Depends(get_db)):
        s = _require_db(db)
        rows = list_all(s)
        return [_row_to_out(r, public_base_url) for r in rows]

    @router.get("/{panorama_id}", response_model=PanoramaOut)
    def get_panorama(panorama_id: str, db: Session = Depends(get_db)):
        s = _require_db(db)
        row = get_one(s, panorama_id)
        if not row:
            raise HTTPException(status_code=404, detail="Panorama not found")
        return _row_to_out(row, public_base_url)

    @router.patch("/{panorama_id}", response_model=PanoramaOut)
    def patch_panorama(panorama_id: str, body: PanoramaPatch, db: Session = Depends(get_db)):
        s = _require_db(db)
        row = patch_metadata(
            s,
            panorama_id,
            title=body.title,
            date_display=body.date_display,
            device_id=body.device_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Panorama not found")
        return _row_to_out(row, public_base_url)

    @router.get("/{panorama_id}/image")
    def get_stitched_file(panorama_id: str, db: Session = Depends(get_db)):
        s = _require_db(db)
        row = get_one(s, panorama_id)
        if not row:
            raise HTTPException(status_code=404, detail="Panorama not found")
        path = OUTPUT_DIR / row.stitched_filename
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Stitched image file missing on server")
        return FileResponse(path, media_type="image/jpeg")

    @router.get("/{panorama_id}/staged")
    def get_staged_file(panorama_id: str, db: Session = Depends(get_db)):
        s = _require_db(db)
        row = get_one(s, panorama_id)
        if not row or not row.staged_filename:
            raise HTTPException(status_code=404, detail="Staged image not found")
        path = OUTPUT_DIR / row.staged_filename
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Staged image file missing on server")
        return FileResponse(path, media_type="image/jpeg")

    return router

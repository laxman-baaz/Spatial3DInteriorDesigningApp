"""Pydantic shapes for panorama REST API (snake_case JSON)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class PanoramaOut(BaseModel):
    id: str
    title: str
    date_display: str | None = None
    stitched_filename: str
    staged_filename: str | None = None
    staging_prompt_last: str | None = None
    world3d: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    device_id: str | None = None
    image_url: str
    staged_image_url: str | None = None


class PanoramaPatch(BaseModel):
    title: str | None = None
    date_display: str | None = None
    device_id: str | None = None

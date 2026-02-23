"""
WorldLabs Marble API helper.

Full pipeline for 360 panorama → navigable 3D world:
  1. prepare_upload  → get signed GCS URL + media_asset_id
  2. PUT image bytes → upload directly to GCS
  3. worlds:generate → submit generation job (panorama mode)
  4. poll operations → wait until done
  5. return          → world metadata (splat URLs, mesh URL, marble URL, etc.)

WorldLabs requires full 360° equirectangular, 2:1 aspect ratio, to treat the
image as the ENVIRONMENT (not a picture on a wall). We ensure 2:1 and send
an explicit prompt so the panorama is reconstructed as the real 3D world.

Output format:
  - SPZ  (3D Gaussian Splat) – 100k / 500k / full_res variants
  - GLB  (collider mesh)
  - JPEG (re-rendered panorama from WorldLabs)
  - Marble viewer URL  (https://marble.worldlabs.ai/world/{world_id})

Environment variable:
  WORLDLABS_API_KEY  – from https://platform.worldlabs.ai/api-keys
"""
import os
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
import requests

_BASE = "https://api.worldlabs.ai"
_POLL_INTERVAL_S = 8
_POLL_TIMEOUT_S  = 540  # 9 min – well inside the app's 10-min window


# ── Result dataclass ──────────────────────────────────────────────────────────
@dataclass
class WorldResult:
    world_id:          str
    marble_url:        str
    thumbnail_url:     Optional[str]
    caption:           Optional[str]
    pano_url:          Optional[str]
    spz_url_100k:      Optional[str]
    spz_url_500k:      Optional[str]
    spz_url_full:      Optional[str]
    collider_mesh_url: Optional[str]  # GLB


def _headers(api_key: str) -> dict:
    return {"WLT-Api-Key": api_key, "Content-Type": "application/json"}


# WorldLabs recommended panorama size for environment recognition
_PANO_WIDTH_WORLDLABS = 2560
_PANO_HEIGHT_WORLDLABS = 1280  # 2:1

# ── Ensure full 360° equirectangular (2:1) for WorldLabs environment mode ─
def ensure_equirect_2to1(image_bytes: bytes) -> bytes:
    """
    Resize to exactly 2:1 and WorldLabs-recommended size (2560×1280) so the
    image is recognized as a full 360° panorama and used as the 3D environment,
    not as a picture on a wall.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes
    h, w = img.shape[:2]
    if w <= 0 or h <= 0:
        return image_bytes
    target_ratio = 2.0
    current_ratio = w / h
    if abs(current_ratio - target_ratio) > 0.01:
        if current_ratio > target_ratio:
            new_w, new_h = w, int(round(w / target_ratio))
        else:
            new_h, new_w = h, int(round(h * target_ratio))
        new_w, new_h = max(new_w, 256), max(new_h, 128)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    # Resize to recommended size so WorldLabs reliably treats as full 360° pano
    img = cv2.resize(
        img, (_PANO_WIDTH_WORLDLABS, _PANO_HEIGHT_WORLDLABS),
        interpolation=cv2.INTER_LINEAR,
    )
    _, out = cv2.imencode(".jpg", img)
    return out.tobytes() if out is not None else image_bytes


# ── Step 1+2: upload panorama as a media asset ────────────────────────────────
def upload_panorama(image_bytes: bytes, api_key: str) -> str:
    """Upload panorama to WorldLabs; return media_asset_id."""

    # 1a. Prepare upload (get signed URL)
    prep = requests.post(
        f"{_BASE}/marble/v1/media-assets:prepare_upload",
        headers=_headers(api_key),
        json={"file_name": "panorama.jpg", "kind": "image", "extension": "jpg"},
        timeout=30,
    )
    prep.raise_for_status()
    prep_data = prep.json()
    print(f"[WorldLabs] prepare_upload response keys={list(prep_data.keys())} body={prep_data}")

    # Handle both documented and live response shapes
    media_asset = prep_data.get("media_asset") or prep_data.get("mediaAsset") or {}
    upload_info = prep_data.get("upload_info") or prep_data.get("uploadInfo") or {}

    media_asset_id: str = (
        media_asset.get("media_asset_id")  # actual key WorldLabs returns
        or media_asset.get("id")
        or media_asset.get("asset_id")
        or media_asset.get("mediaAssetId")
        or prep_data.get("id")
    )
    if not media_asset_id:
        raise RuntimeError(
            f"Could not find media_asset_id in prepare_upload response: {prep_data}"
        )

    upload_url: str = (
        upload_info.get("upload_url")
        or upload_info.get("uploadUrl")
        or prep_data.get("upload_url")
    )
    if not upload_url:
        raise RuntimeError(
            f"Could not find upload_url in prepare_upload response: {prep_data}"
        )

    upload_headers: dict = upload_info.get("required_headers") or upload_info.get("requiredHeaders") or {}

    print(f"[WorldLabs] media_asset_id={media_asset_id} uploading {len(image_bytes)} bytes…")

    # 1b. PUT image bytes to signed GCS URL (no auth header needed here)
    up = requests.put(
        upload_url,
        headers=upload_headers,
        data=image_bytes,
        timeout=120,
    )
    up.raise_for_status()
    print(f"[WorldLabs] upload OK (HTTP {up.status_code})")
    return media_asset_id


# Prompt so WorldLabs reconstructs FROM the panorama as the only source (no wall photo / no extra objects)
_PANORAMA_ENVIRONMENT_PROMPT = (
    "This is a full 360 degree equirectangular panorama of a real interior room. "
    "Reconstruct the entire 3D navigable world from this single panorama only. "
    "The panorama IS the scene: use it as the complete environment. "
    "Do not place this image as a texture on a wall or as a picture. Do not generate separate 3D objects; the geometry and appearance must come from this panorama."
)

# ── Step 3: submit world generation ──────────────────────────────────────────
def submit_world_generation(
    media_asset_id: str,
    display_name: str,
    text_prompt: str,
    api_key: str,
    model: str = "Marble 0.1-plus",
) -> str:
    """Submit a panorama→world generation job; return operation_id."""
    effective_prompt = (text_prompt or display_name or "").strip() or _PANORAMA_ENVIRONMENT_PROMPT
    payload = {
        "display_name": display_name,
        "model": model,
        "world_prompt": {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_id,
            },
            "is_pano": True,
            "text_prompt": effective_prompt,
            "disable_recaption": True,
        },
    }

    resp = requests.post(
        f"{_BASE}/marble/v1/worlds:generate",
        headers=_headers(api_key),
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    print(f"[WorldLabs] worlds:generate response keys={list(body.keys())} body={body}")

    operation_id: str = (
        body.get("operation_id")
        or body.get("operationId")
        or (body.get("operation") or {}).get("id")
    )
    if not operation_id:
        raise RuntimeError(f"Could not find operation_id in generate response: {body}")

    print(f"[WorldLabs] generation submitted → operation_id={operation_id}")
    return operation_id


# ── Step 4: poll until done ───────────────────────────────────────────────────
def poll_operation(operation_id: str, api_key: str) -> dict:
    """Poll until operation.done is True; return the world response dict."""
    deadline = time.time() + _POLL_TIMEOUT_S
    while time.time() < deadline:
        resp = requests.get(
            f"{_BASE}/marble/v1/operations/{operation_id}",
            headers={"WLT-Api-Key": api_key},
            timeout=30,
        )
        resp.raise_for_status()
        op = resp.json()

        progress = (op.get("metadata") or {}).get("progress", {})
        status   = progress.get("status", "UNKNOWN")
        print(f"[WorldLabs] poll operation_id={operation_id} status={status}")

        if op.get("done"):
            if op.get("error"):
                raise RuntimeError(f"WorldLabs generation failed: {op['error']}")
            response = op.get("response")
            print(f"[WorldLabs] operation done, response keys={list(response.keys()) if isinstance(response, dict) else response}")
            return response  # world dict (or wrapped dict – _parse_world handles both)

        if status in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"WorldLabs generation {status}: {progress.get('description')}")

        time.sleep(_POLL_INTERVAL_S)

    raise TimeoutError(
        f"WorldLabs operation {operation_id} did not complete within {_POLL_TIMEOUT_S}s"
    )


# ── Step 5: parse world response into WorldResult ─────────────────────────────
def _parse_world(response: dict) -> WorldResult:
    """
    The WorldLabs operation response can come back in two shapes:
      Shape A (documented): {"id": "...", "assets": {...}, ...}
      Shape B (live API):   {"world": {"id": "...", "assets": {...}, ...}}
    Handle both gracefully.
    """
    # Unwrap shape B
    if "world" in response and isinstance(response["world"], dict):
        world = response["world"]
    elif "id" in response:
        world = response
    else:
        # Unknown shape – log and try to proceed
        print(f"[WorldLabs] WARNING: unexpected response shape, keys={list(response.keys())}")
        # Try to find any nested dict that has "id"
        world = next(
            (v for v in response.values() if isinstance(v, dict) and "id" in v),
            response,
        )

    print(f"[WorldLabs] parsing world id={world.get('id')} keys={list(world.keys())}")

    assets  = world.get("assets") or {}
    splats  = (assets.get("splats") or {}).get("spz_urls") or {}
    mesh    = assets.get("mesh") or {}
    imagery = assets.get("imagery") or {}

    world_id = world.get("id") or world.get("world_id") or "unknown"
    return WorldResult(
        world_id          = world_id,
        marble_url        = world.get("world_marble_url")
                            or f"https://marble.worldlabs.ai/world/{world_id}",
        thumbnail_url     = assets.get("thumbnail_url"),
        caption           = assets.get("caption"),
        pano_url          = imagery.get("pano_url"),
        spz_url_100k      = splats.get("100k"),
        spz_url_500k      = splats.get("500k"),
        spz_url_full      = splats.get("full_res"),
        collider_mesh_url = mesh.get("collider_mesh_url"),
    )


# ── Top-level convenience function ───────────────────────────────────────────
def reconstruct_world(
    image_bytes: bytes,
    display_name: str,
    text_prompt: str,
    api_key: str,
    model: str = "Marble 0.1-plus",
) -> WorldResult:
    """
    Full pipeline: panorama bytes → WorldResult with all asset URLs.
    Ensures 2:1 aspect ratio so WorldLabs uses the image as the full environment.
    Takes ~5 minutes with Marble 0.1-plus, ~30-45s with Marble 0.1-mini.
    """
    image_bytes = ensure_equirect_2to1(image_bytes)
    media_asset_id = upload_panorama(image_bytes, api_key)
    operation_id   = submit_world_generation(
        media_asset_id, display_name, text_prompt, api_key, model
    )
    world_dict = poll_operation(operation_id, api_key)
    result     = _parse_world(world_dict)

    print(
        f"[WorldLabs] reconstruction complete → world_id={result.world_id}"
        f" marble_url={result.marble_url}"
    )
    return result

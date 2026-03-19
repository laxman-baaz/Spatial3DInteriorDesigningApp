"""
NanoBanana AI Staging helper.

Flow:
  1. Upload panorama bytes to imgbb  → get a public HTTPS URL
  2. Submit IMAGETOIMAGE task to NanoBanana API
  3. Poll task status until SUCCESS (or timeout / failure)
  4. Download and return staged image bytes

Also: Gemini AI stitching for photosphere (column + full 360°) via stitch_panorama_google.
"""
import base64
import os
import time

import requests

# ── API endpoints ─────────────────────────────────────────────────────────────
_NB_BASE = "https://api.nanobananaapi.ai"
_IMGBB_UPLOAD = "https://api.imgbb.com/1/upload"
_GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Use gemini-3-pro-image-preview for stitching (column + full 360°)
_GEMINI_STITCH_MODEL = "gemini-3-pro-image-preview"

# Dummy callback URL – we use polling instead of webhooks
_DUMMY_CALLBACK = "https://nanobananaapi.ai/"

# NanoBanana successFlag values
_STATUS_GENERATING    = 0
_STATUS_SUCCESS       = 1
_STATUS_CREATE_FAILED = 2
_STATUS_GEN_FAILED    = 3


# ── Google Gemini API (stitching) ─────────────────────────────────────────────
def _call_gemini_generate(model: str, api_key: str, payload: dict) -> requests.Response:
    """Single Gemini generateContent call."""
    url = f"{_GOOGLE_BASE}/{model}:generateContent"
    return requests.post(
        url,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=420,
    )


# Prompts: pure stitching only, no added content
STITCH_COLUMN_PROMPT = (
    "TASK: Pure image stitching only. Stitch these images into one seamless vertical panorama "
    "(one wall/column). Place them in order top-to-bottom, blend edges where they overlap. "
    "Output must contain ONLY what appears in the provided images. Do NOT add walls, furniture, "
    "decor, objects, modals, or any content not in the originals. Do NOT duplicate or repeat "
    "any objects to fill space. Do NOT fill empty areas with generated content. "
    "Every pixel must come from the input images — only arrange and blend them."
)

STITCH_360_PANORAMA_PROMPT = (
    "TASK: Pure image stitching only. Arrange these exact images into one equirectangular 360° panorama. "
    "Place them in order (left to right around the room), blend edges where they overlap. "
    "Output must contain ONLY what appears in the provided images. Do NOT add walls, cupboards, "
    "furniture, decor, objects, modals, or any content not in the originals. Do NOT duplicate "
    "or repeat objects to fill space. Do NOT fill empty areas with generated content. "
    "Every pixel must come from the input images — only arrange and blend them."
)


# 24-dot layout: 8 columns × 3 rings. App sends row-major: upper(8), center(8), lower(8).
# Column i = images[i], images[i+8], images[i+16] (top to bottom)
NUM_COLS = 8
IMAGES_PER_COL = 3


def stitch_panorama_google(images: list[bytes], prompt: str, api_key: str) -> bytes:
    """
    Use Gemini (gemini-3-pro-image-preview) to stitch images into panorama.
    For column: use STITCH_COLUMN_PROMPT. For full 360°: use STITCH_360_PANORAMA_PROMPT.
    """
    model = os.environ.get("GEMINI_IMAGE_MODEL", _GEMINI_STITCH_MODEL)
    parts = []
    for img_bytes in images:
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": b64}})
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }

    resp = _call_gemini_generate(model, api_key, payload)
    if not (200 <= resp.status_code < 300):
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", "") or str(err)
        except Exception:
            msg = resp.text[:500] if resp.text else f"HTTP {resp.status_code}"
        raise RuntimeError(f"Gemini {resp.status_code}: {msg}")

    body = resp.json()
    candidates = body.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {body.get('error', body)}")
    cand = candidates[0]
    finish_reason = cand.get("finishReason", "")
    if finish_reason and finish_reason not in ("STOP", "MAX_TOKENS"):
        raise RuntimeError(f"Gemini blocked output (finishReason={finish_reason})")
    for part in cand.get("content", {}).get("parts", []):
        if "inlineData" in part:
            data = part["inlineData"].get("data")
            if data:
                return base64.b64decode(data)
    raise RuntimeError("Gemini response did not contain an image")


def stitch_photosphere_column_then_full(
    images: list[bytes], api_key: str
) -> bytes:
    """
    Two-phase stitching for 24-dot photosphere:
    1. Stitch each column (3 images: upper, center, lower) → 8 column panoramas
    2. Stitch the 8 columns into one 360° equirectangular panorama

    Expects images in TARGET_DOTS order: upper ring (8), center ring (8), lower ring (8).
    """
    n = len(images)
    if n != NUM_COLS * IMAGES_PER_COL:
        raise ValueError(
            f"Expected {NUM_COLS * IMAGES_PER_COL} images (8 columns × 3 rings), got {n}. "
            "Use stitch_panorama_google for other counts."
        )

    # Phase 1: stitch each column (3 images top-to-bottom)
    column_panoramas = []
    for col in range(NUM_COLS):
        col_images = [
            images[col],           # upper (pitch 135°)
            images[col + NUM_COLS],  # center (pitch 90°)
            images[col + NUM_COLS * 2],  # lower (pitch 45°)
        ]
        print(f"[NanoBanana] Phase 1: stitching column {col + 1}/{NUM_COLS}")
        col_pano = stitch_panorama_google(col_images, STITCH_COLUMN_PROMPT, api_key)
        column_panoramas.append(col_pano)

    # Phase 2: stitch all columns into 360°
    print(f"[NanoBanana] Phase 2: stitching {NUM_COLS} columns into 360° panorama")
    return stitch_panorama_google(column_panoramas, STITCH_360_PANORAMA_PROMPT, api_key)


# ── imgbb upload ──────────────────────────────────────────────────────────────
def upload_to_imgbb(image_bytes: bytes, api_key: str) -> str:
    """Upload raw image bytes to imgbb; return the public image URL."""
    b64 = base64.b64encode(image_bytes).decode()
    resp = requests.post(
        _IMGBB_UPLOAD,
        params={"key": api_key},
        data={"image": b64},
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"imgbb upload failed: {body}")
    url = body["data"]["url"]
    print(f"[NanoBanana] imgbb upload OK → {url}")
    return url


# ── NanoBanana task submit ────────────────────────────────────────────────────
def submit_staging_task(
    image_url: str,
    prompt: str,
    api_key: str,
    image_size: str = "16:9",
) -> str:
    """Submit an IMAGETOIMAGE generation task; return taskId."""
    resp = requests.post(
        f"{_NB_BASE}/api/v1/nanobanana/generate",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "type": "IMAGETOIAMGE",   # note: their API spells it this way
            "prompt": prompt,
            "imageUrls": [image_url],
            "numImages": 1,
            "image_size": image_size,
            "callBackUrl": _DUMMY_CALLBACK,
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != 200:
        raise RuntimeError(f"NanoBanana submit failed: {body}")
    task_id = body["data"]["taskId"]
    print(f"[NanaBanana] task submitted → taskId={task_id}")
    return task_id


# ── NanoBanana polling ────────────────────────────────────────────────────────
def poll_staging_task(
    task_id: str,
    api_key: str,
    timeout_s: int = 540,   # 9 min – safely inside the app's 10-min window
    interval_s: int = 5,
) -> str:
    """Poll until the task succeeds; return resultImageUrl."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(
            f"{_NB_BASE}/api/v1/nanobanana/record-info",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"taskId": task_id},
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("code") != 200:
            raise RuntimeError(f"NanoBanana poll error: {body}")

        data = body["data"]
        flag = data.get("successFlag", _STATUS_GENERATING)
        print(f"[NanoBanana] poll taskId={task_id} successFlag={flag}")

        if flag == _STATUS_SUCCESS:
            url = data["response"]["resultImageUrl"]
            print(f"[NanoBanana] staging complete → {url}")
            return url
        if flag in (_STATUS_CREATE_FAILED, _STATUS_GEN_FAILED):
            raise RuntimeError(
                f"NanoBanana task failed (flag={flag}): {data.get('errorMessage')}"
            )
        time.sleep(interval_s)

    raise TimeoutError(
        f"NanoBanana task {task_id} did not complete within {timeout_s}s"
    )


# ── Google Gemini staging (image-to-image) ────────────────────────────────────
def stage_panorama_google(image_bytes: bytes, prompt: str, api_key: str) -> bytes:
    """
    Use Gemini for AI interior staging. No imgbb needed—image sent as base64.
    """
    model = os.environ.get("GEMINI_IMAGE_MODEL", _GEMINI_STITCH_MODEL)
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    parts = [
        {"inlineData": {"mimeType": "image/jpeg", "data": b64}},
        {"text": f"Edit this interior panorama to match this staging: {prompt}. Return only the edited image, no text."},
    ]
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    resp = _call_gemini_generate(model, api_key, payload)
    if not (200 <= resp.status_code < 300):
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", "") or str(err)
        except Exception:
            msg = resp.text[:500] if resp.text else f"HTTP {resp.status_code}"
        raise RuntimeError(f"Gemini {resp.status_code}: {msg}")
    body = resp.json()
    candidates = body.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {body.get('error', body)}")
    cand = candidates[0]
    finish_reason = cand.get("finishReason", "")
    if finish_reason and finish_reason not in ("STOP", "MAX_TOKENS"):
        raise RuntimeError(f"Gemini blocked output (finishReason={finish_reason})")
    for part in cand.get("content", {}).get("parts", []):
        if "inlineData" in part:
            data = part["inlineData"].get("data")
            if data:
                return base64.b64decode(data)
    raise RuntimeError("Gemini response did not contain an image")


# ── Top-level helper ──────────────────────────────────────────────────────────
def stage_panorama(
    image_bytes: bytes,
    prompt: str,
    nanobanana_key: str,
    imgbb_key: str,
    google_key: str | None = None,
) -> bytes:
    """
    Staging pipeline. Uses Google Gemini if google_key is set; else NanoBanana API.
    """
    if google_key and google_key.strip():
        return stage_panorama_google(image_bytes, prompt, google_key.strip())
    public_url = upload_to_imgbb(image_bytes, imgbb_key)
    task_id    = submit_staging_task(public_url, prompt, nanobanana_key)
    result_url = poll_staging_task(task_id, nanobanana_key)
    print(f"[NanoBanana] downloading result from {result_url}")
    dl = requests.get(result_url, timeout=60)
    dl.raise_for_status()
    return dl.content

"""
NanoBanana AI Staging helper.

Supports two backends:
  1. Google Gemini API (GOOGLE_API_KEY) – uses key as query param, no imgbb needed
  2. NanoBanana API (NANOBANANA_API_KEY) – Bearer token, requires imgbb for image URLs

Flow for NanoBanana:
  1. Upload panorama bytes to imgbb  → get a public HTTPS URL
  2. Submit IMAGETOIMAGE task to NanoBanana API
  3. Poll task status until SUCCESS (or timeout / failure)
  4. Download and return staged image bytes

Flow for Google:
  1. POST to Gemini generateContent with inline base64 image + prompt
  2. Extract generated image from response
"""
import base64
import os
import time

import requests

# ── API endpoints ─────────────────────────────────────────────────────────────
_NB_BASE = "https://api.nanobananaapi.ai"
_IMGBB_UPLOAD = "https://api.imgbb.com/1/upload"
_GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Image generation models – use GEMINI_IMAGE_MODEL env to override
# gemini-3.1-flash-image-preview (Nano Banana 2) is the one that works for most keys
_GOOGLE_IMAGE_MODELS = [
    "gemini-3.1-flash-image-preview",
    "gemini-2.0-flash-preview-image-generation",
]

# Dummy callback URL – we use polling instead of webhooks
_DUMMY_CALLBACK = "https://nanobananaapi.ai/"

# NanoBanana successFlag values
_STATUS_GENERATING    = 0
_STATUS_SUCCESS       = 1
_STATUS_CREATE_FAILED = 2
_STATUS_GEN_FAILED    = 3


# ── Google Gemini API (image-to-image) ──────────────────────────────────────────
def _call_gemini_generate(
    model: str, api_key: str, payload: dict
) -> requests.Response:
    """Single Gemini generateContent call."""
    url = f"{_GOOGLE_BASE}/{model}:generateContent"
    return requests.post(
        url,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )


# Prompt for AI stitching of 4 wall images into equirectangular panorama
STITCH_PANORAMA_PROMPT = (
    "Take these 4 room wall images and create an equirectangular panorama as if shot with a 360 camera. "
    "Place them side by side in order, blending the edges where walls meet at 90-degree corners. "
    "The result should look like a natural interior panorama with smooth corner transitions, "
    "no black gaps, and consistent lighting throughout."
)


def stitch_panorama_google(images: list[bytes], prompt: str, api_key: str) -> bytes:
    """
    Use Gemini (NanoBanana 2) to stitch 4 wall images into one seamless panorama.
    Sends all 4 images + prompt; returns the combined panoramic image.
    """
    models = [os.environ.get("GEMINI_IMAGE_MODEL")] if os.environ.get("GEMINI_IMAGE_MODEL") else []
    models = [m for m in models if m] + _GOOGLE_IMAGE_MODELS

    parts = []
    for img_bytes in images:
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": b64}})
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }

    last_err = None
    for model in models:
        resp = _call_gemini_generate(model, api_key, payload)
        if 200 <= resp.status_code < 300:
            print(f"[NanoBanana] stitch using model {model}")
            body = resp.json()
            break
        try:
            err_body = resp.json()
            msg = err_body.get("error", {}).get("message", "") or str(err_body)
        except Exception:
            msg = resp.text[:500] if resp.text else f"HTTP {resp.status_code}"
        if resp.status_code == 404:
            last_err = RuntimeError(f"Model {model} not found: {msg}")
            continue
        if resp.status_code in (401, 403, 429):
            raise RuntimeError(f"Google API {resp.status_code}: {msg}")
        raise RuntimeError(f"Google Gemini HTTP {resp.status_code}: {msg}")
    else:
        raise last_err or RuntimeError("No Gemini image model available")

    candidates = body.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Google Gemini returned no candidates: {body.get('error', body)}")
    cand = candidates[0]
    finish_reason = cand.get("finishReason", "")
    if finish_reason and finish_reason not in ("STOP", "MAX_TOKENS"):
        raise RuntimeError(f"Gemini blocked output (finishReason={finish_reason})")
    for part in cand.get("content", {}).get("parts", []):
        if "inlineData" in part:
            data = part["inlineData"].get("data")
            if data:
                print(f"[NanoBanana] stitch returned image ({len(data)} chars base64)")
                return base64.b64decode(data)
    raise RuntimeError("Gemini response did not contain an image")


def stage_panorama_google(image_bytes: bytes, prompt: str, api_key: str) -> bytes:
    """
    Use Google's Gemini API (Nano Banana) for image-to-image staging.
    Auth: API key as query param (?key=...) – from Google AI Studio (aistudio.google.com/apikey).
    No imgbb needed – image is sent as base64 inline.
    """
    models = [os.environ.get("GEMINI_IMAGE_MODEL")] if os.environ.get("GEMINI_IMAGE_MODEL") else []
    models = [m for m in models if m] + _GOOGLE_IMAGE_MODELS

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                {"text": f"Edit this interior panorama image to match this staging: {prompt}. Return only the edited image, no text."},
            ]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }

    last_err = None
    for model in models:
        resp = _call_gemini_generate(model, api_key, payload)

        if 200 <= resp.status_code < 300:
            print(f"[NanoBanana] using model {model}")
            body = resp.json()
            break

        try:
            err_body = resp.json()
            msg = err_body.get("error", {}).get("message", "") or str(err_body)
        except Exception:
            msg = resp.text[:500] if resp.text else f"HTTP {resp.status_code}"

        if resp.status_code == 404:
            print(f"[NanoBanana] model {model} not found, trying next...")
            last_err = RuntimeError(f"Model {model} not found: {msg}")
            continue
        if resp.status_code == 401:
            raise RuntimeError(
                f"Google API 401 Unauthorized: {msg}. "
                "Check your API key from aistudio.google.com/apikey. "
                "Billing must be enabled for image generation."
            )
        if resp.status_code == 400:
            raise RuntimeError(f"Google Gemini 400 Bad Request: {msg}")
        if resp.status_code == 403:
            raise RuntimeError(
                f"Google API 403 Forbidden: {msg}. "
                "Image generation may require billing or model access."
            )
        if resp.status_code == 429:
            raise RuntimeError(f"Google API 429 Rate limit: {msg}")
        raise RuntimeError(f"Google Gemini HTTP {resp.status_code}: {msg}")
    else:
        if last_err:
            raise last_err
        raise RuntimeError("No Gemini image model available")

    candidates = body.get("candidates") or []
    if not candidates:
        err = body.get("error", {}).get("message", "") or str(body)
        raise RuntimeError(f"Google Gemini returned no candidates: {err}")

    cand = candidates[0]
    finish_reason = cand.get("finishReason", "")
    if finish_reason and finish_reason not in ("STOP", "MAX_TOKENS"):
        # SAFETY, RECITATION, etc. – model blocked or limited output
        raise RuntimeError(
            f"Google Gemini blocked or limited output (finishReason={finish_reason}). "
            "Try a different prompt or image."
        )

    for part in cand.get("content", {}).get("parts", []):
        if "inlineData" in part:
            data = part["inlineData"].get("data")
            if data:
                print(f"[NanoBanana] Google Gemini returned image ({len(data)} chars base64)")
                return base64.b64decode(data)

    raise RuntimeError(
        "Google Gemini response did not contain an image. "
        f"finishReason={finish_reason}, parts={len(cand.get('content', {}).get('parts', []))}"
    )


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


# ── Top-level helper ──────────────────────────────────────────────────────────
def stage_panorama(
    image_bytes: bytes,
    prompt: str,
    nanobanana_key: str,
    imgbb_key: str,
    google_key: str | None = None,
) -> bytes:
    """
    Full staging pipeline. Uses Google Gemini if google_key is set; else NanoBanana API.

    - google_key: Google AI Studio API key (aistudio.google.com/apikey) – key as query param
    - nanobanana_key: NanoBanana API key (nanobananaapi.ai/api-key) – Bearer token
    - imgbb_key: Required only for NanoBanana (to host image URL)
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

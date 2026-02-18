"""
NanoBanana AI Staging helper.

Flow:
  1. Upload panorama bytes to imgbb  → get a public HTTPS URL
  2. Submit IMAGETOIMAGE task to NanoBanana API
  3. Poll task status until SUCCESS (or timeout / failure)
  4. Download and return staged image bytes
"""
import base64
import os
import time

import requests

# ── API endpoints ─────────────────────────────────────────────────────────────
_NB_BASE = "https://api.nanobananaapi.ai"
_IMGBB_UPLOAD = "https://api.imgbb.com/1/upload"

# Dummy callback URL – we use polling instead of webhooks
_DUMMY_CALLBACK = "https://nanobananaapi.ai/"

# NanoBanana successFlag values
_STATUS_GENERATING    = 0
_STATUS_SUCCESS       = 1
_STATUS_CREATE_FAILED = 2
_STATUS_GEN_FAILED    = 3


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
) -> bytes:
    """
    Full staging pipeline:
      upload → submit → poll → download
    Returns the staged image as raw JPEG bytes.
    """
    public_url = upload_to_imgbb(image_bytes, imgbb_key)
    task_id    = submit_staging_task(public_url, prompt, nanobanana_key)
    result_url = poll_staging_task(task_id, nanobanana_key)

    print(f"[NanoBanana] downloading result from {result_url}")
    dl = requests.get(result_url, timeout=60)
    dl.raise_for_status()
    return dl.content

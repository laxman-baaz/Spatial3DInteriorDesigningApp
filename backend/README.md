# Panorama Stitching Backend (Python + OpenCV)

Stitches 32-dot photosphere images into a single **equirectangular panorama** (360×180°, rectangular 2:1 image) using known poses—no feature matching.

## Setup

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
```

## Run

**Option A – use the run script (recommended; uses venv automatically):**
- Windows: `run.bat` or `.\run.bat`
- Git Bash: `./run.sh` or `venv/Scripts/python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000`

**Option B – activate venv then uvicorn:**
- Windows CMD: `venv\Scripts\activate` then `uvicorn app:app --reload --host 0.0.0.0 --port 8000`
- Git Bash: `source venv/Scripts/activate` then `uvicorn app:app --reload --host 0.0.0.0 --port 8000`

(Must use the venv Python so `cv2` is found; system Python does not have the backend packages.)

- API docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

## API

### `POST /stitch`

Upload 32 images (same order as app’s TARGET_DOTS) plus poses; returns the stitched panorama as JPEG.

**Form fields:**

| Field          | Type | Description |
|----------------|------|-------------|
| `images`      | 32 files | Image files in TARGET_DOTS order |
| `poses_json`  | string   | JSON array of `{"pitch": deg, "yaw": deg}` × 32 |
| `output_width`| int (optional) | Equirectangular width (default 4096; height = width/2) |

**Poses:** `pitch` 0 = nadir, 90 = horizon, 180 = zenith; `yaw` 0..360 (degrees).

**Response:** JPEG body; headers `X-Panorama-Id`, `X-Panorama-Path` with saved file path.

**Saved files:** By default panoramas are also written under `PANORAMA_OUTPUT_DIR` (default: system temp). Set e.g. `set PANORAMA_OUTPUT_DIR=C:\Panoramas` to keep them in a fixed folder.

## Example (curl)

```bash
# Build poses_json from app's 32-dot config (pitches and yaws in order)
# Then:
curl -X POST http://localhost:8000/stitch \
  -F "poses_json=[{\"pitch\":180,\"yaw\":0},{\"pitch\":150,\"yaw\":0},...]" \
  -F "images=@img_00.jpg" -F "images=@img_01.jpg" ... (32 times)
```

## React Native app

Point the app at this backend (e.g. `http://YOUR_PC_IP:8000`) and POST the 32 captured images + poses when the user taps “Stitch panorama”; use the returned JPEG or the path from headers for storage/AsyncStorage and cards.

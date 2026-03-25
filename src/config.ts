/**
 * Backend panorama stitching API (Python + Gemini AI).
 * - iOS sim / Android emulator: http://localhost:8000 (Android: use http://10.0.2.2:8000)
 * - Physical device: your PC IP, e.g. http://192.168.1.100:8000
 * Android: enable cleartext in android/app/src/main/AndroidManifest.xml if using http.
 */
// export const BACKEND_STITCH_URL = 'http://localhost:8000';
export const BACKEND_STITCH_URL = 'http://10.110.254.171:8000';

/**
 * When true, PATCH /panoramas/{id} after local save (requires DATABASE_URL on backend).
 * Stage/reconstruct always send panorama_id so the backend can update Postgres when configured.
 */
export const SYNC_PANORAMA_METADATA_TO_SERVER = false;

/**
 * When true, Home + 3D Gallery merge GET /panoramas with AsyncStorage.
 * After clearing app data, lists still show panoramas (images load from your PC via BACKEND_STITCH_URL).
 */
export const FETCH_PANORAMAS_FROM_SERVER = true;

export function getStitchApiUrl(path: string): string {
  const base = BACKEND_STITCH_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Backend panorama stitching API (Python/OpenCV).
 * - iOS sim / Android emulator: http://localhost:8000 (Android: use http://10.0.2.2:8000)
 * - Physical device: your PC IP, e.g. http://192.168.1.100:8000
 * Android: enable cleartext in android/app/src/main/AndroidManifest.xml if using http.
 */
// export const BACKEND_STITCH_URL = 'http://localhost:8000';
export const BACKEND_STITCH_URL = 'http://10.187.185.171:8000';

export function getStitchApiUrl(path: string): string {
  const base = BACKEND_STITCH_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

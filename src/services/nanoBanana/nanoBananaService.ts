/**
 * NanoBanana AI Staging Service
 *
 * Sends a local panorama file to the backend /stage endpoint.
 * The backend uploads it to imgbb (public hosting) then calls NanoBanana,
 * polls until done, and streams the staged JPEG back to us.
 *
 * Returns the staged image as a base64 string (no data-URL prefix).
 */

import ReactNativeBlobUtil from 'react-native-blob-util';
import { getStitchApiUrl } from '../../config';

const LOG = '[NanoBananaService]';

export interface StagingResult {
  stagedBase64: string;  // raw base64 JPEG – save with panoramaStorage.saveStaged()
  stagedId: string;      // X-Staged-Id header from backend
}

/**
 * Submit a panorama for AI staging.
 *
 * @param panoramaUri  file:// URI of the local stitched panorama
 * @param prompt       interior design staging description
 */
export async function stageWithAI(
  panoramaUri: string,
  prompt: string,
): Promise<StagingResult> {
  const url = getStitchApiUrl('/stage');

  // Strip file:// prefix – RNBlobUtil wants the raw path
  const filePath = panoramaUri.startsWith('file://')
    ? panoramaUri.slice(7)
    : panoramaUri;

  // NanoBanana staging = imgbb upload + AI generation + polling (can take 2-5 min).
  // Set a generous 10-minute timeout so the request doesn't abort mid-flight.
  const TIMEOUT_MS = 10 * 60 * 1000;

  console.log(`${LOG} POST ${url} | prompt="${prompt}" | file=${filePath} | timeout=${TIMEOUT_MS}ms`);

  const resp = await ReactNativeBlobUtil.config({ timeout: TIMEOUT_MS }).fetch(
    'POST',
    url,
    { 'Content-Type': 'multipart/form-data' },
    [
      {
        name: 'image',
        filename: 'panorama.jpg',
        type: 'image/jpeg',
        data: ReactNativeBlobUtil.wrap(filePath),
      },
      {
        name: 'prompt',
        data: prompt,
      },
    ],
  );

  const status = resp.respInfo.status;
  console.log(`${LOG} response status=${status}`);

  if (status < 200 || status >= 300) {
    const body = resp.text();
    throw new Error(`/stage returned HTTP ${status}: ${body}`);
  }

  const stagedId: string =
    (resp.respInfo.headers as Record<string, string>)['x-staged-id'] ??
    (resp.respInfo.headers as Record<string, string>)['X-Staged-Id'] ??
    `staged_${Date.now()}`;

  // Backend returns raw JPEG bytes – read as base64
  const stagedBase64 = resp.base64();

  if (!stagedBase64) {
    throw new Error('Staging response contained no image data');
  }

  console.log(
    `${LOG} staging OK | stagedId=${stagedId} | base64Len=${stagedBase64.length}`,
  );

  return { stagedBase64, stagedId };
}

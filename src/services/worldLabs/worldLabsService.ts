/**
 * WorldLabs Marble 3D Reconstruction Service
 *
 * Sends a panorama (stitched or AI-staged) to the backend /reconstruct endpoint.
 * The backend uploads to WorldLabs, polls until the world is ready (~5 min),
 * then returns JSON with all asset URLs.
 *
 * Output assets returned by WorldLabs Marble:
 *   - marble_url        → navigable 3D world in the Marble browser viewer
 *   - spz_url_500k      → 3D Gaussian Splat file (500k points) – SPZ format
 *   - spz_url_full      → full-resolution SPZ splat
 *   - collider_mesh_url → GLB collision mesh
 *   - pano_url          → re-rendered 360 panorama from WorldLabs
 *   - thumbnail_url     → static preview image
 *   - caption           → AI-generated scene description
 */

import ReactNativeBlobUtil from 'react-native-blob-util';
import { getStitchApiUrl } from '../../config';

const LOG = '[WorldLabsService]';

export interface World3DResult {
  worldId:         string;
  marbleUrl:       string;
  thumbnailUrl:    string | null;
  caption:         string | null;
  panoUrl:         string | null;
  spzUrl100k:      string | null;
  spzUrl500k:      string | null;
  spzUrlFull:      string | null;
  colliderMeshUrl: string | null; // GLB
}

/**
 * Submit a panorama for 3D world reconstruction via WorldLabs Marble.
 *
 * @param panoramaUri   file:// URI of the panorama to reconstruct (staged preferred)
 * @param displayName   human-readable name for the world
 * @param textPrompt    optional hint for reconstruction ("modern living room")
 * @param model         'Marble 0.1-plus' (best, ~5 min) | 'Marble 0.1-mini' (draft, ~45s)
 */
export async function reconstructWorld(
  panoramaUri: string,
  displayName: string,
  textPrompt: string  = '',
  model: string       = 'Marble 0.1-plus',
): Promise<World3DResult> {
  const url = getStitchApiUrl('/reconstruct');

  const filePath = panoramaUri.startsWith('file://')
    ? panoramaUri.slice(7)
    : panoramaUri;

  // WorldLabs generation takes up to ~5 min (plus). Give a 12-min window.
  const TIMEOUT_MS = 12 * 60 * 1000;

  console.log(
    `${LOG} POST ${url} | model="${model}" | display="${displayName}" | file=${filePath}`,
  );

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
      { name: 'display_name', data: displayName },
      { name: 'text_prompt',  data: textPrompt },
      { name: 'model',        data: model },
    ],
  );

  const status = resp.respInfo.status;
  console.log(`${LOG} response status=${status}`);

  if (status < 200 || status >= 300) {
    const body = resp.text();
    throw new Error(`/reconstruct returned HTTP ${status}: ${body}`);
  }

  let json: any;
  try {
    json = JSON.parse(resp.text());
  } catch {
    throw new Error('Invalid JSON response from /reconstruct');
  }

  if (!json.world_id) {
    throw new Error(`Unexpected /reconstruct response: ${JSON.stringify(json)}`);
  }

  const result: World3DResult = {
    worldId:         json.world_id,
    marbleUrl:       json.marble_url,
    thumbnailUrl:    json.thumbnail_url    ?? null,
    caption:         json.caption          ?? null,
    panoUrl:         json.pano_url         ?? null,
    spzUrl100k:      json.spz_url_100k     ?? null,
    spzUrl500k:      json.spz_url_500k     ?? null,
    spzUrlFull:      json.spz_url_full     ?? null,
    colliderMeshUrl: json.collider_mesh_url ?? null,
  };

  console.log(
    `${LOG} reconstruction OK | worldId=${result.worldId} | marbleUrl=${result.marbleUrl}`,
  );
  return result;
}

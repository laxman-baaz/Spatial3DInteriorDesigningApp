/**
 * Optional sync with backend PostgreSQL (panorama metadata + stable image URLs).
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  FETCH_PANORAMAS_FROM_SERVER,
  getStitchApiUrl,
  SYNC_PANORAMA_METADATA_TO_SERVER,
} from '../config';
import type {PanoramaItem, World3DMeta} from './panoramaStorage';

const LOG = '[PanoramaApi]';

/** Same id as ThreeDScreen stitching placeholder — skip when uploading */
export const STITCHING_PLACEHOLDER_ID = '_stitching_placeholder';

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function fileUriToPath(uri: string): string | null {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) {
    return null;
  }
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

export type ServerPanoramaRow = {
  id: string;
  title: string;
  date_display: string | null;
  image_url: string;
  staged_image_url: string | null;
  world3d: World3DMeta | null;
};

/**
 * Update title / date_display after local savePanorama (row is created on /stitch).
 */
export async function syncPanoramaMetadata(
  panoramaId: string,
  title: string,
  dateDisplay: string,
): Promise<void> {
  if (!SYNC_PANORAMA_METADATA_TO_SERVER) {
    return;
  }
  try {
    const url = getStitchApiUrl(`/panoramas/${encodeURIComponent(panoramaId)}`);
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        title,
        date_display: dateDisplay,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.warn(`${LOG} PATCH metadata ${r.status}: ${t}`);
    }
  } catch (e) {
    console.warn(`${LOG} syncPanoramaMetadata failed`, e);
  }
}

/**
 * Map server row to a PanoramaItem (remote images). Merge with local list as needed.
 */
export function serverRowToPanoramaItem(row: ServerPanoramaRow): PanoramaItem {
  return {
    id: row.id,
    title: row.title,
    date: row.date_display ?? '',
    imageUri: row.image_url,
    stagedImageUri: row.staged_image_url ?? undefined,
    world3d: row.world3d ?? undefined,
  };
}

/**
 * Fetch panoramas from Postgres (GET /panoramas). Returns null on failure / 503.
 */
export async function fetchPanoramasFromServer(): Promise<PanoramaItem[] | null> {
  if (!FETCH_PANORAMAS_FROM_SERVER) {
    return null;
  }
  try {
    const r = await fetch(getStitchApiUrl('/panoramas'));
    if (!r.ok) {
      console.warn(`${LOG} GET /panoramas ${r.status}`);
      return null;
    }
    const rows = (await r.json()) as ServerPanoramaRow[];
    if (!Array.isArray(rows)) {
      return null;
    }
    // Show list in reverse order vs GET /panoramas JSON array order
    return [...rows].reverse().map(serverRowToPanoramaItem);
  } catch (e) {
    console.warn(`${LOG} fetchPanoramasFromServer`, e);
    return null;
  }
}

function mergeLocalAndServer(
  local: PanoramaItem[],
  server: PanoramaItem[],
): PanoramaItem[] {
  const localById = new Map(local.map(p => [p.id, p]));
  const out: PanoramaItem[] = [];
  const seen = new Set<string>();

  for (const s of server) {
    const l = localById.get(s.id);
    if (!l) {
      out.push(s);
    } else {
      const useLocalStitched = l.imageUri.startsWith('file');
      const useLocalStaged =
        !!l.stagedImageUri && l.stagedImageUri.startsWith('file');
      out.push({
        ...s,
        imageUri: useLocalStitched ? l.imageUri : s.imageUri,
        stagedImageUri: useLocalStaged
          ? l.stagedImageUri
          : s.stagedImageUri ?? l.stagedImageUri,
        title: l.title || s.title,
        date: l.date || s.date,
        world3d: l.world3d ?? s.world3d,
      });
    }
    seen.add(s.id);
  }

  for (const l of local) {
    if (!seen.has(l.id)) {
      out.push(l);
    }
  }

  return out;
}

/**
 * AsyncStorage list + GET /panoramas (when FETCH_PANORAMAS_FROM_SERVER).
 * Use on Home / 3D Gallery so clearing app data still shows server-backed panoramas.
 */
export async function loadPanoramasMergedWithServer(): Promise<PanoramaItem[]> {
  const {loadPanoramas} = await import('./panoramaStorage');
  const local = await loadPanoramas();
  if (!FETCH_PANORAMAS_FROM_SERVER) {
    return local;
  }
  const server = await fetchPanoramasFromServer();
  if (!server || server.length === 0) {
    return local;
  }
  if (local.length === 0) {
    console.log(`${LOG} merged load: 0 local, ${server.length} from server`);
    return server;
  }
  const merged = mergeLocalAndServer(local, server);
  console.log(
    `${LOG} merged load: ${local.length} local + ${server.length} server → ${merged.length} items`,
  );
  return merged;
}

/**
 * Upload one local panorama (stitched + optional staged + world3d) to POST /panoramas/import.
 * Requires DATABASE_URL on the backend. Does not depend on SYNC_PANORAMA_METADATA_TO_SERVER.
 */
export async function uploadLocalPanoramaToServer(
  item: PanoramaItem,
): Promise<{ok: boolean; error?: string}> {
  if (item.id === STITCHING_PLACEHOLDER_ID) {
    return {ok: false, error: 'skip placeholder'};
  }

  const stitchPath = fileUriToPath(item.imageUri);
  if (!stitchPath) {
    return {
      ok: false,
      error: 'stitched image must be a local file (file://), not a remote URL',
    };
  }

  const stitchExists = await ReactNativeBlobUtil.fs.exists(stitchPath);
  if (!stitchExists) {
    return {ok: false, error: `stitched file missing: ${stitchPath}`};
  }

  const parts: Parameters<typeof ReactNativeBlobUtil.fetch>[3] = [
    {name: 'panorama_id', data: item.id},
    {name: 'title', data: item.title},
    {name: 'date_display', data: item.date},
    {
      name: 'image',
      filename: 'panorama.jpg',
      type: 'image/jpeg',
      data: ReactNativeBlobUtil.wrap(stitchPath),
    },
  ];

  if (item.stagedImageUri) {
    const stagedPath = fileUriToPath(item.stagedImageUri);
    if (stagedPath && (await ReactNativeBlobUtil.fs.exists(stagedPath))) {
      parts.push({
        name: 'staged_image',
        filename: 'staged.jpg',
        type: 'image/jpeg',
        data: ReactNativeBlobUtil.wrap(stagedPath),
      });
    }
  }

  if (item.world3d) {
    parts.push({name: 'world3d_json', data: JSON.stringify(item.world3d)});
  }

  const url = getStitchApiUrl('/panoramas/import');

  try {
    const resp = await ReactNativeBlobUtil.config({
      timeout: UPLOAD_TIMEOUT_MS,
    }).fetch('POST', url, {'Content-Type': 'multipart/form-data'}, parts);

    const status = resp.respInfo.status;
    if (status < 200 || status >= 300) {
      const body = await resp.text();
      return {ok: false, error: `HTTP ${status}: ${String(body).slice(0, 200)}`};
    }
    console.log(`${LOG} import OK id=${item.id}`);
    return {ok: true};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {ok: false, error: msg};
  }
}

/**
 * Upload every panorama from AsyncStorage, one after another (sequential).
 */
export async function pushAllLocalPanoramasToServer(): Promise<{
  uploaded: number;
  failed: number;
  errors: string[];
}> {
  const {loadPanoramas} = await import('./panoramaStorage');
  const list = await loadPanoramas();
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of list) {
    const r = await uploadLocalPanoramaToServer(item);
    if (r.ok) {
      uploaded += 1;
    } else {
      failed += 1;
      if (r.error && r.error !== 'skip placeholder') {
        errors.push(`${item.title} (${item.id.slice(0, 8)}…): ${r.error}`);
      }
    }
  }

  return {uploaded, failed, errors};
}

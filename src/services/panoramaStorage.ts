/**
 * Store stitched panoramas locally: AsyncStorage for list + file system for image.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';

const STORAGE_KEY = '@panoramas';
const LOG_TAG = '[PanoramaStorage]';

export interface World3DMeta {
  worldId:         string;
  marbleUrl:       string;   // https://marble.worldlabs.ai/world/{id}
  thumbnailUrl:    string | null;
  caption:         string | null;
  panoUrl:         string | null;
  spzUrl100k:      string | null;
  spzUrl500k:      string | null;
  spzUrlFull:      string | null;
  colliderMeshUrl: string | null; // GLB
}

export interface PanoramaItem {
  id: string;
  title: string;
  date: string;
  imageUri: string;         // file:// path to local stitched JPEG
  stagedImageUri?: string;  // file:// path to NanoBanana AI-staged JPEG (optional)
  world3d?: World3DMeta;    // WorldLabs 3D reconstruction metadata (optional)
}

/**
 * Load all saved panoramas from AsyncStorage.
 */
export async function loadPanoramas(): Promise<PanoramaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log(`${LOG_TAG} loadPanoramas: no data in AsyncStorage`);
      return [];
    }
    const list = JSON.parse(raw) as PanoramaItem[];
    const out = Array.isArray(list) ? list : [];
    console.log(`${LOG_TAG} loadPanoramas: loaded ${out.length} item(s)`);
    return out;
  } catch (e) {
    console.warn(`${LOG_TAG} loadPanoramas failed:`, e);
    return [];
  }
}

/**
 * Save a new panorama: write image to app documents, then append to AsyncStorage list.
 * imageBase64: base64 string (no data URL prefix).
 */
export async function savePanorama(
  id: string,
  imageBase64: string,
  title?: string
): Promise<PanoramaItem> {
  const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  const filename = `panorama_${id}.jpg`;
  const path = `${dir}/${filename}`;

  console.log(`${LOG_TAG} savePanorama: writing file path=${path}, base64Len=${imageBase64.length}`);
  await ReactNativeBlobUtil.fs.writeFile(path, imageBase64, 'base64');

  const imageUri = path.startsWith('file://') ? path : `file://${path}`;

  const item: PanoramaItem = {
    id,
    title: title ?? `Panorama ${id.slice(0, 8)}`,
    date: formatDate(new Date()),
    imageUri,
  };

  const list = await loadPanoramas();
  list.unshift(item);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  console.log(`${LOG_TAG} savePanorama: saved id=${id}, imageUri=${imageUri}, totalPanoramas=${list.length}`);

  return item;
}

/**
 * Save a NanoBanana-staged image for an existing panorama.
 * Writes the file and updates the panorama record's stagedImageUri.
 */
export async function saveStaged(
  panoramaId: string,
  stagedBase64: string,
): Promise<string> {
  const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  const filename = `staged_${panoramaId}.jpg`;
  const path = `${dir}/${filename}`;

  console.log(`${LOG_TAG} saveStaged: writing path=${path}, base64Len=${stagedBase64.length}`);
  await ReactNativeBlobUtil.fs.writeFile(path, stagedBase64, 'base64');

  const stagedUri = path.startsWith('file://') ? path : `file://${path}`;

  const list = await loadPanoramas();
  const idx = list.findIndex(p => p.id === panoramaId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], stagedImageUri: stagedUri };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    console.log(`${LOG_TAG} saveStaged: updated panorama id=${panoramaId} stagedUri=${stagedUri}`);
  } else {
    console.warn(`${LOG_TAG} saveStaged: panorama id=${panoramaId} not found in storage`);
  }

  return stagedUri;
}

/**
 * Attach WorldLabs 3D reconstruction metadata to an existing panorama record.
 */
export async function saveWorld3D(
  panoramaId: string,
  world3d: World3DMeta,
): Promise<void> {
  const list = await loadPanoramas();
  const idx  = list.findIndex(p => p.id === panoramaId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], world3d };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    console.log(
      `${LOG_TAG} saveWorld3D: updated panorama id=${panoramaId} worldId=${world3d.worldId}`,
    );
  } else {
    console.warn(`${LOG_TAG} saveWorld3D: panorama id=${panoramaId} not found`);
  }
}

/**
 * Extract base64 from data URL (e.g. from stitch result).
 */
export function dataUrlToBase64(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : null;
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

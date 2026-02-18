/**
 * Call the Python/OpenCV backend POST /stitch to create equirectangular panorama.
 * Uses react-native-blob-util so we get response as base64 for saving locally.
 */
import { getStitchApiUrl } from '../../config';
import ReactNativeBlobUtil from 'react-native-blob-util';

const LOG_TAG = '[StitchAPI]';

export interface StitchApiResult {
  success: boolean;
  panoramaId?: string;
  serverPath?: string;
  imageData?: string; // base64 data URL for preview/save
  error?: string;
  durationMs?: number;
}

export interface StitchApiImage {
  path: string; // file://... or absolute path
  pitch: number;
  yaw: number;
}

/**
 * Upload images + poses to backend; returns stitched panorama result.
 */
export async function stitchPanoramaViaApi(
  images: StitchApiImage[],
  options: { outputWidth?: number } = {}
): Promise<StitchApiResult> {
  const start = Date.now();
  const outputWidth = options.outputWidth ?? 4096;
  const url = getStitchApiUrl('/stitch');

  console.log(`${LOG_TAG} Calling POST ${url} with ${images.length} image(s), outputWidth=${outputWidth}`);

  if (images.length < 1) {
    console.log(`${LOG_TAG} Abort: no images`);
    return {
      success: false,
      error: 'Capture at least one image to create a panorama',
      durationMs: Date.now() - start,
    };
  }

  const posesJson = JSON.stringify(images.map((img) => ({ pitch: img.pitch, yaw: img.yaw })));

  const body = [
    { name: 'poses_json', data: posesJson },
    { name: 'output_width', data: String(outputWidth) },
    ...images.map((img, i) => ({
      name: 'images',
      filename: `img_${i}.jpg`,
      type: 'image/jpeg',
      data: ReactNativeBlobUtil.wrap(img.path.replace(/^file:\/\//, '')),
    })),
  ];

  try {
    const response = await ReactNativeBlobUtil.fetch('POST', url, {
      'Content-Type': 'multipart/form-data',
    }, body);

    const status = response.respInfo?.status ?? 0;
    const headers = response.respInfo?.headers || {};
    const panoramaId = headers['X-Panorama-Id'] ?? headers['x-panorama-id'];
    const serverPath = headers['X-Panorama-Path'] ?? headers['x-panorama-path'];

    console.log(`${LOG_TAG} Response status=${status}, panoramaId=${panoramaId ?? 'n/a'}, serverPath=${serverPath ?? 'n/a'}`);

    if (status < 200 || status >= 300) {
      let errBody = '';
      try {
        errBody = typeof response.text === 'function' ? response.text() : await Promise.resolve(response.respInfo?.body ?? '');
      } catch (_) {}
      console.log(`${LOG_TAG} Error body: ${String(errBody).slice(0, 300)}`);
      return {
        success: false,
        panoramaId,
        serverPath,
        error: String(errBody || `HTTP ${status}`),
        durationMs: Date.now() - start,
      };
    }

    let imageData: string | undefined;
    try {
      let base64Str: string | null = null;
      const b64 = response.base64?.();
      if (typeof b64 === 'string') {
        base64Str = b64;
      } else if (b64 != null && typeof (b64 as Promise<string>).then === 'function') {
        base64Str = await (b64 as Promise<string>);
      }
      if (base64Str) {
        imageData = `data:image/jpeg;base64,${base64Str}`;
        console.log(`${LOG_TAG} Got response base64, length=${base64Str.length}`);
      } else {
        const path = response.path?.();
        if (path) {
          base64Str = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
          imageData = `data:image/jpeg;base64,${base64Str}`;
          console.log(`${LOG_TAG} Read response from path, base64 length=${base64Str.length}`);
        }
      }
    } catch (e) {
      console.warn(`${LOG_TAG} Failed to get image data from response:`, e);
    }

    if (!imageData) {
      console.log(`${LOG_TAG} imageData is missing - panorama will NOT be saved to Recent Projects`);
    }

    const durationMs = Date.now() - start;
    console.log(`${LOG_TAG} Success in ${durationMs}ms, hasImageData=${!!imageData}`);

    return {
      success: true,
      panoramaId,
      serverPath,
      imageData,
      durationMs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_TAG} Request failed:`, message);
    return {
      success: false,
      error: message,
      durationMs: Date.now() - start,
    };
  }
}
